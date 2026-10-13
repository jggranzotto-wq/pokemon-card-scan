import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { catalogHashDistances, type ImageHashCache } from "./image-match";
import { decideOcrIdentification } from "./ocr-match";
import { prepareUploadImage } from "./prepare-upload";
import type { PokemonCard } from "../types/card";

const ARTS = [
  ["sv3-223", "Charizard ex", "223", "223/197", "sv3"],
  ["sv3-125", "Charizard ex", "125", "125/197", "sv3"],
  ["base1-4", "Charizard", "4", "4/102", "base1"],
  ["swsh3-20", "Charizard V", "20", "20/189", "swsh3"],
  ["sm3-4", "Charizard", "4", "4/147", "sm3"],
] as const;

function solve(matrix: number[][], values: number[]): number[] {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let colIndex = col; colIndex <= size; colIndex++) rows[col][colIndex] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let colIndex = col; colIndex <= size; colIndex++) rows[row][colIndex] -= factor * rows[col][colIndex];
    }
  }
  return rows.map((row) => row[size]);
}

function homography(from: number[][], to: number[][]): number[] {
  const matrix: number[][] = [];
  const values: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }
  return solve(matrix, values);
}

function applyHomography(h: number[], x: number, y: number): [number, number] {
  const w = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** A 4000px phone-style photo: the card is in perspective on a table and slightly blurred. */
async function photoOfCard(card: Buffer): Promise<Buffer> {
  const src = await sharp(card).resize({ width: 700 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sw = src.info.width;
  const sh = src.info.height;
  const channels = src.info.channels;
  const dw = 1100;
  const dh = 1500;
  const dest = [
    [160, 220],
    [980, 120],
    [1040, 1320],
    [90, 1380],
  ];
  const source = [
    [0, 0],
    [sw - 1, 0],
    [sw - 1, sh - 1],
    [0, sh - 1],
  ];
  const map = homography(dest, source);
  const out = Buffer.alloc(dw * dh * 3);
  for (let i = 0; i < out.length; i += 3) {
    out[i] = 214;
    out[i + 1] = 208;
    out[i + 2] = 196;
  }
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const [sx, sy] = applyHomography(map, x, y);
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const tx = sx - x0;
      const ty = sy - y0;
      const sample = [0, 0, 0];
      for (let channel = 0; channel < 3; channel++) {
        const i00 = (y0 * sw + x0) * channels + channel;
        const i10 = i00 + channels;
        const i01 = i00 + sw * channels;
        const i11 = i01 + channels;
        const top = src.data[i00] * (1 - tx) + src.data[i10] * tx;
        const bottom = src.data[i01] * (1 - tx) + src.data[i11] * tx;
        sample[channel] = top * (1 - ty) + bottom * ty;
      }
      const offset = (y * dw + x) * 3;
      out[offset] = sample[0];
      out[offset + 1] = sample[1];
      out[offset + 2] = sample[2];
    }
  }
  const warped = await sharp(out, { raw: { width: dw, height: dh, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  return sharp(warped).resize({ width: 4000, height: 4000, fit: "inside" }).blur(1.1).jpeg({ quality: 86 }).toBuffer();
}

function imagePath(id: string): string {
  const [set, number] = id.split("-");
  return `${set}/${number}`;
}

async function download(id: string): Promise<Buffer> {
  const response = await fetch(`https://images.pokemontcg.io/${imagePath(id)}.png`);
  if (!response.ok) throw new Error(`catalog image ${id} returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

describe("sv3-223 photo", () => {
  it("ranks Charizard ex 223 from a 4000px perspective photo when OCR says number 7", async () => {
    const files = new Map<string, Buffer>();
    for (const [id] of ARTS) files.set(id, await download(id));
    const photo = await photoOfCard(files.get("sv3-223")!);
    const photoMeta = await sharp(photo).metadata();
    assert.equal(Math.max(photoMeta.width ?? 0, photoMeta.height ?? 0), 4000);

    const prepared = await prepareUploadImage(photo);
    assert.ok(Math.max(prepared.width, prepared.height) <= 1600);
    const cards: PokemonCard[] = ARTS.map(([id, name, number, printedNumber, setId]) => ({
      id,
      name,
      setName: setId,
      setId,
      number,
      printedNumber,
      language: "English",
      images: { small: `https://images.pokemontcg.io/${imagePath(id)}.png` },
      variantHints: [],
    }));
    const cache: ImageHashCache = {
      async get() {
        return null;
      },
      async set() {},
    };
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const path = String(url).match(/images\.pokemontcg\.io\/(.+)\.png/)?.[1];
      const id = path?.replaceAll("/", "-");
      const bytes = id ? files.get(id) : undefined;
      if (!bytes) return new Response("missing", { status: 404 });
      return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/png" } });
    }) as typeof fetch;

    const distances = await catalogHashDistances(prepared.bytes, cards, { fetchImpl, cache });
    const decision = decideOcrIdentification({
      extracted: { name: "Charizard", collectorNumber: "7" },
      cards,
      distances,
    });
    assert.equal(decision.candidates[0]?.id, "sv3-223");
    assert.equal(decision.autoSelectedId, "sv3-223");
    assert.equal(decision.message, undefined);
    const winner = distances.get("sv3-223") ?? 64;
    const runnerUp = Math.min(...[...distances.entries()].filter(([id]) => id !== "sv3-223").map(([, distance]) => distance));
    assert.ok(winner + 6 <= runnerUp);
  });
});
