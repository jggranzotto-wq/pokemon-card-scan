export async function compressImage(file: Blob, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that photo.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not prepare that photo.");
  return blob;
}

export async function readCardText(image: Blob, onProgress?: (status: string) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  onProgress?.("Loading text reader…");
  const worker = await createWorker("eng");
  try {
    onProgress?.("Reading the card…");
    const { data } = await worker.recognize(image);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export const SAMPLE_CARD = {
  image: "https://images.pokemontcg.io/base1/4_hires.png",
  text: "Charizard\nHP 120\n4/102\nBase Set",
};
