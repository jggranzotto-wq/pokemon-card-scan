import { createWorker, PSM, type Worker } from "tesseract.js";

type Lang = "eng" | "jpn";

const workers = new Map<Lang, Promise<Worker>>();

async function workerFor(lang: Lang): Promise<Worker> {
  const existing = workers.get(lang);
  if (existing) return existing;

  const started = createWorker(lang, 1).then(async (worker) => {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    return worker;
  });
  workers.set(lang, started);
  try {
    return await started;
  } catch (error) {
    workers.delete(lang);
    throw error;
  }
}

export async function ocrCardImage(bytes: Buffer, lang: Lang = "eng"): Promise<string> {
  const worker = await workerFor(lang);
  const { data } = await worker.recognize(bytes);
  return (data.text ?? "").trim();
}
