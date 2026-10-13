import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { prepareUploadImage, UPLOAD_JPEG_QUALITY, UPLOAD_MAX_EDGE } from "./prepare-upload";

async function solidJpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } },
  }).jpeg({ quality: 95 });
  if (orientation) pipeline = pipeline.withMetadata({ orientation });
  return pipeline.toBuffer();
}

describe("prepareUploadImage", () => {
  it("shrinks a 4000px photo to a 1600px JPEG", async () => {
    const input = await solidJpeg(4000, 3000);
    const prepared = await prepareUploadImage(input);
    assert.equal(prepared.mimeType, "image/jpeg");
    assert.equal(prepared.width, 1600);
    assert.equal(prepared.height, 1200);
    assert.ok(prepared.bytes.length < input.length);
    const meta = await sharp(prepared.bytes).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, UPLOAD_MAX_EDGE);
    assert.equal(meta.height, 1200);
  });

  it("shrinks a tall photo on the long edge", async () => {
    const prepared = await prepareUploadImage(await solidJpeg(1200, 4000));
    assert.equal(prepared.width, 480);
    assert.equal(prepared.height, UPLOAD_MAX_EDGE);
  });

  it("keeps a smaller photo and still writes JPEG", async () => {
    const prepared = await prepareUploadImage(await solidJpeg(800, 600));
    assert.equal(prepared.width, 800);
    assert.equal(prepared.height, 600);
    assert.equal((await sharp(prepared.bytes).metadata()).format, "jpeg");
  });

  it("applies EXIF orientation before measuring the long edge", async () => {
    const prepared = await prepareUploadImage(await solidJpeg(40, 20, 6));
    assert.equal(prepared.width, 20);
    assert.equal(prepared.height, 40);
  });

  it("rejects a buffer that is not a photo", async () => {
    await assert.rejects(() => prepareUploadImage(Buffer.from("not a photo")), /Could not read that photo/);
  });

  it("uses JPEG quality 85", () => {
    assert.equal(UPLOAD_JPEG_QUALITY, 85);
  });
});
