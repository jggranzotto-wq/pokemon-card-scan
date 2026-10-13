import sharp from "sharp";
import { differenceHash, hashDistance } from "./dhash";

/** Illustration window on a straightened card, shared by the photo and the catalog art. */
export const ART_BOX = { x: 0.07, y: 0.11, w: 0.86, h: 0.5 };

const PREFIX = "v2";

export async function extractArtBox(input: Buffer, box = ART_BOX): Promise<Buffer> {
  const meta = await sharp(input, { failOn: "none" }).rotate().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 20 || height < 20) return input;
  const left = clamp(Math.round(width * box.x), 0, width - 2);
  const top = clamp(Math.round(height * box.y), 0, height - 2);
  const cropW = clamp(Math.round(width * box.w), 2, width - left);
  const cropH = clamp(Math.round(height * box.h), 2, height - top);
  return sharp(input, { failOn: "none" }).rotate().extract({ left, top, width: cropW, height: cropH }).toBuffer();
}

/** dHash, pHash, and a color histogram of the card's art box. */
export async function artSignature(input: Buffer): Promise<string> {
  const art = await extractArtBox(input);
  const [dhash, phash, hist] = await Promise.all([differenceHash(art), perceptualHash(art), colorHistogram(art)]);
  return encodeSignature(dhash, phash, hist);
}

export function encodeSignature(dhash: string, phash: string, hist: number[]): string {
  const colors = hist.map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("");
  return `${PREFIX}:${dhash}:${phash}:${colors}`;
}

export function signatureDistance(left: string, right: string): number | null {
  const a = decodeSignature(left);
  const b = decodeSignature(right);
  if (!a || !b) return null;
  const dHash = hashDistance(a.dhash, b.dhash);
  const pHash = hashDistance(a.phash, b.phash);
  const color = histogramDistance(a.hist, b.hist);
  return dHash * 0.4 + pHash * 0.4 + color * 0.2;
}

async function perceptualHash(input: Buffer): Promise<string> {
  const size = 32;
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize(size, size, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Float64Array(size * size);
  for (let i = 0; i < pixels.length; i++) pixels[i] = data[i * info.channels];
  const freq = dct2(pixels, size);
  const low: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) low.push(freq[y * size + x]);
  }
  const median = [...low].sort((a, b) => a - b)[Math.floor(low.length / 2)] ?? 0;
  let bits = 0n;
  low.forEach((value, index) => {
    if (value > median) bits |= 1n << BigInt(index);
  });
  return bits.toString(16).padStart(16, "0");
}

async function colorHistogram(input: Buffer): Promise<number[]> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize(48, 48, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = new Array<number>(64).fill(0);
  const pixels = info.width * info.height;
  for (let i = 0; i < pixels; i++) {
    const offset = i * info.channels;
    const r = data[offset] >> 6;
    const g = data[offset + 1] >> 6;
    const b = data[offset + 2] >> 6;
    bins[(r << 4) | (g << 2) | b] += 1;
  }
  return bins.map((count) => Math.round((count / pixels) * 255));
}

function histogramDistance(left: number[], right: number[]): number {
  let total = 0;
  for (let i = 0; i < left.length; i++) total += Math.abs((left[i] ?? 0) - (right[i] ?? 0));
  return Math.min(64, (total / 255) * 32);
}

function dct2(pixels: Float64Array, size: number): Float64Array {
  const rows = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    const row = dct1(pixels.subarray(y * size, y * size + size));
    rows.set(row, y * size);
  }
  const out = new Float64Array(size * size);
  const column = new Float64Array(size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) column[y] = rows[y * size + x];
    const transformed = dct1(column);
    for (let y = 0; y < size; y++) out[y * size + x] = transformed[y];
  }
  return out;
}

function dct1(input: Float64Array): Float64Array {
  const n = input.length;
  const out = new Float64Array(n);
  const factor = Math.PI / n;
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += input[i] * Math.cos((i + 0.5) * k * factor);
    out[k] = sum;
  }
  return out;
}

function decodeSignature(value: string): { dhash: string; phash: string; hist: number[] } | null {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [dhash, phash, colors] = [parts[1], parts[2], parts[3]];
  if (!/^[0-9a-f]{16}$/.test(dhash) || !/^[0-9a-f]{16}$/.test(phash) || colors.length !== 128) return null;
  const hist: number[] = [];
  for (let i = 0; i < colors.length; i += 2) hist.push(Number.parseInt(colors.slice(i, i + 2), 16));
  return { dhash, phash, hist };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
