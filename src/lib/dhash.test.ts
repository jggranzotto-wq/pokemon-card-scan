import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { differenceHash, hashDistance } from "./dhash";

async function stripes(width: number, height: number, vertical: boolean): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = vertical ? Math.floor(x / 10) % 2 === 0 : Math.floor(y / 10) % 2 === 0;
      const i = (y * width + x) * 3;
      const value = on ? 240 : 20;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

describe("differenceHash", () => {
  it("matches a resized copy and rejects a different pattern", async () => {
    const vertical = await stripes(180, 240, true);
    const verticalSmall = await stripes(90, 120, true);
    const horizontal = await stripes(180, 240, false);
    const same = hashDistance(await differenceHash(vertical), await differenceHash(verticalSmall));
    const different = hashDistance(await differenceHash(vertical), await differenceHash(horizontal));
    assert.ok(same <= 8);
    assert.ok(different >= 16);
  });
});
