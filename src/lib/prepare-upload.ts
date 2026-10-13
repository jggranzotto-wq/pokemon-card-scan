import sharp from "sharp";

/** Longest side sent to Gemini and OCR. Matches the client compressor. */
export const UPLOAD_MAX_EDGE = 1600;

/** sharp uses 1–100. 85 is the server equivalent of client JPEG quality 0.85. */
export const UPLOAD_JPEG_QUALITY = 85;

export type PreparedUpload = {
  bytes: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

/**
 * Turn an uploaded photo into a JPEG whose long edge is at most 1600px.
 * EXIF orientation is applied first so a sideways phone photo is not re-encoded sideways.
 */
export async function prepareUploadImage(input: Buffer): Promise<PreparedUpload> {
  try {
    const oriented = sharp(input, { failOn: "none", animated: false }).rotate();
    const meta = await oriented.metadata();
    const sourceWidth = meta.width ?? 0;
    const sourceHeight = meta.height ?? 0;
    if (sourceWidth < 1 || sourceHeight < 1) {
      throw new Error("Could not read that photo.");
    }

    let pipeline = sharp(input, { failOn: "none", animated: false }).rotate();
    if (Math.max(sourceWidth, sourceHeight) > UPLOAD_MAX_EDGE) {
      pipeline = pipeline.resize({
        width: UPLOAD_MAX_EDGE,
        height: UPLOAD_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const bytes = await pipeline.jpeg({ quality: UPLOAD_JPEG_QUALITY }).toBuffer();
    const out = await sharp(bytes).metadata();
    const width = out.width ?? 0;
    const height = out.height ?? 0;
    if (width < 1 || height < 1 || Math.max(width, height) > UPLOAD_MAX_EDGE) {
      throw new Error("Could not read that photo.");
    }
    return { bytes, mimeType: "image/jpeg", width, height };
  } catch (error) {
    if (error instanceof Error && error.message === "Could not read that photo.") throw error;
    const detail = error instanceof Error ? error.message : "unreadable image";
    console.error(`[identify] could not prepare photo (${detail})`);
    throw new Error("Could not read that photo.");
  }
}
