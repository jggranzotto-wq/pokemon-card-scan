import sharp from "sharp";

type Box = { left: number; top: number; width: number; height: number };

/**
 * Crop the photo to the card and rotate a small tilt back to level.
 * The hash is then comparing the card, not the table around it.
 */
export async function straightenCardPhoto(input: Buffer): Promise<Buffer> {
  try {
    const oriented = sharp(input, { failOn: "none" }).rotate();
    const meta = await oriented.metadata();
    const fullW = meta.width ?? 0;
    const fullH = meta.height ?? 0;
    if (fullW < 16 || fullH < 16) return input;

    const sampleW = Math.min(fullW, 480);
    const sample = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: sampleW })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const sw = sample.info.width;
    const sh = sample.info.height;
    const channels = sample.info.channels;
    const lum = luminance(sample.data, sw, sh, channels);
    const edge = sobel(lum, sw, sh);
    const angle = minAreaAngle(edge, sw, sh);
    let pipeline = sharp(input, { failOn: "none" }).rotate();
    if (Math.abs(angle) >= 0.5) {
      pipeline = pipeline.rotate(angle, { background: cornerColor(sample.data, sw, sh, channels) });
    }
    return cropToCard(await pipeline.toBuffer());
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unreadable photo";
    console.error(`[identify] could not straighten photo (${detail})`);
    return input;
  }
}

async function cropToCard(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 16 || height < 16) return sharp(input).jpeg({ quality: 85 }).toBuffer();

  const sampleW = Math.min(width, 480);
  const sample = await sharp(input)
    .resize({ width: sampleW })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const edge = sobel(
    luminance(sample.data, sample.info.width, sample.info.height, sample.info.channels),
    sample.info.width,
    sample.info.height,
  );
  const box = edgeBox(edge, sample.info.width, sample.info.height);
  if (!box) return sharp(input).jpeg({ quality: 85 }).toBuffer();
  const boxScale = width / sample.info.width;
  const pad = Math.round(Math.max(box.width, box.height) * boxScale * 0.02);
  const left = clamp(Math.floor(box.left * boxScale) - pad, 0, width - 2);
  const top = clamp(Math.floor(box.top * boxScale) - pad, 0, height - 2);
  const cropW = clamp(Math.ceil(box.width * boxScale) + pad * 2, 2, width - left);
  const cropH = clamp(Math.ceil(box.height * boxScale) + pad * 2, 2, height - top);
  const area = (cropW * cropH) / (width * height);
  if (area < 0.08 || area > 0.98) return sharp(input).jpeg({ quality: 85 }).toBuffer();

  return sharp(input)
    .extract({ left, top, width: cropW, height: cropH })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function cornerColor(data: Buffer, width: number, height: number, channels: number): { r: number; g: number; b: number } {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const index of corners) {
    const offset = index * channels;
    r += data[offset] ?? 255;
    g += data[offset + 1] ?? data[offset] ?? 255;
    b += data[offset + 2] ?? data[offset] ?? 255;
  }
  return { r: Math.round(r / corners.length), g: Math.round(g / corners.length), b: Math.round(b / corners.length) };
}

function luminance(data: Buffer, width: number, height: number, channels: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const o = i * channels;
    out[i] = channels === 1 ? data[o] : data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
  }
  return out;
}

function sobel(lum: Float32Array, width: number, height: number): Uint8Array {
  const edge = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -lum[i - width - 1] +
        lum[i - width + 1] -
        2 * lum[i - 1] +
        2 * lum[i + 1] -
        lum[i + width - 1] +
        lum[i + width + 1];
      const gy =
        -lum[i - width - 1] -
        2 * lum[i - width] -
        lum[i - width + 1] +
        lum[i + width - 1] +
        2 * lum[i + width] +
        lum[i + width + 1];
      edge[i] = Math.hypot(gx, gy) > 48 ? 1 : 0;
    }
  }
  return edge;
}

function edgeBox(edge: Uint8Array, width: number, height: number): Box | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  const margin = 2;
  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      if (!edge[y * width + x]) continue;
      if (x < left) left = x;
      if (y < top) top = y;
      if (x > right) right = x;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Angle, in degrees, that makes the card's edge box as small as possible. */
function minAreaAngle(edge: Uint8Array, width: number, height: number): number {
  const points: { x: number; y: number }[] = [];
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      if (edge[y * width + x]) points.push({ x, y });
    }
  }
  if (points.length < 20) return 0;
  const cx = width / 2;
  const cy = height / 2;
  let best = 0;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let deg = -12; deg <= 12; deg += 0.5) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      const dx = point.x - cx;
      const dy = point.y - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      if (rx < minX) minX = rx;
      if (ry < minY) minY = ry;
      if (rx > maxX) maxX = rx;
      if (ry > maxY) maxY = ry;
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < bestArea) {
      bestArea = area;
      best = deg;
    }
  }
  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
