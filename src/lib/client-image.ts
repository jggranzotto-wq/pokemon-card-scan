type WorkerLike = {
  recognize: (image: Blob) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<void>;
};

const workers = new Map<string, Promise<WorkerLike>>();

function tesseractPaths() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    workerPath: `${origin}/tesseract/worker.min.js`,
    corePath: `${origin}/tesseract/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${origin}/tessdata`,
    gzip: false as const,
    cacheMethod: "none" as const,
  };
}

export function preloadOcr(lang: "eng" | "jpn" = "eng"): Promise<WorkerLike> {
  const existing = workers.get(lang);
  if (existing) return existing;
  const started = import("tesseract.js").then(async ({ createWorker }) =>
    createWorker(lang, 1, tesseractPaths()),
  );
  workers.set(lang, started);
  return started;
}

async function bitmapFromBlob(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // HEIC / odd Android camera formats fall through to HTMLImageElement.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that photo."));
      el.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: Blob, maxEdge = 1800, quality = 0.86): Promise<Blob> {
  const source = await bitmapFromBlob(file);
  const srcW = "width" in source ? source.width : 0;
  const srcH = "height" in source ? source.height : 0;
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that photo.");
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source && typeof source.close === "function") source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not prepare that photo.");
  return blob;
}

export async function readCardText(
  image: Blob,
  onProgress?: (status: string) => void,
  lang: "eng" | "jpn" = "eng",
): Promise<string> {
  onProgress?.(lang === "jpn" ? "Reading Japanese text…" : "Loading text reader…");
  const worker = await preloadOcr(lang);
  onProgress?.("Reading the card…");
  const { data } = await worker.recognize(image);
  return data.text ?? "";
}

export const SAMPLE_CARD = {
  image: "https://images.pokemontcg.io/base1/4_hires.png",
  text: "Charizard\nHP 120\n4/102\nBase Set",
};
