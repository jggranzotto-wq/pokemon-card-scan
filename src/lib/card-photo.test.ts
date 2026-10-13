import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { straightenCardPhoto } from "./card-photo";

async function cardOnTable(tilt = 0): Promise<{ photo: Buffer; ratio: number }> {
  const card = await sharp({
    create: { width: 160, height: 220, channels: 3, background: { r: 180, g: 40, b: 50 } },
  })
    .png()
    .toBuffer();
  const placed = tilt
    ? await sharp(card).rotate(tilt, { background: { r: 245, g: 245, b: 245 } }).png().toBuffer()
    : card;
  const meta = await sharp(placed).metadata();
  const photo = await sharp({
    create: { width: 420, height: 520, channels: 3, background: { r: 245, g: 245, b: 245 } },
  })
    .composite([{ input: placed, gravity: "centre" }])
    .jpeg({ quality: 90 })
    .toBuffer();
  return { photo, ratio: (meta.width ?? 1) / (meta.height ?? 1) };
}

describe("straightenCardPhoto", () => {
  it("crops the card out of the surrounding table", async () => {
    const { photo } = await cardOnTable();
    const before = await sharp(photo).metadata();
    const cropped = await straightenCardPhoto(photo);
    const after = await sharp(cropped).metadata();
    assert.ok((after.width ?? 0) < (before.width ?? 0));
    assert.ok((after.height ?? 0) < (before.height ?? 0));
    assert.ok((after.width ?? 0) > 120);
    assert.ok((after.height ?? 0) > 160);
  });

  it("straightens a slightly tilted card", async () => {
    const { photo, ratio } = await cardOnTable(8);
    const cropped = await straightenCardPhoto(photo);
    const meta = await sharp(cropped).metadata();
    const next = (meta.width ?? 1) / (meta.height ?? 1);
    assert.ok(Math.abs(next - 160 / 220) < Math.abs(ratio - 160 / 220));
  });
});
