import { isPlausibleTcgYear } from "./card-year";
import type { CardLanguage, CardVariant, ExtractedCard } from "../types/card";

const PROMPT = `Identify the Pokémon trading card in this photo.
Return JSON only with this shape:
{
  "name": "card name",
  "set": "set name if visible or null",
  "collectorNumber": "number only, e.g. 4 from 4/102",
  "printedTotal": "102 if shown as 4/102, else null",
  "variant": "holo" | "reverse" | "1st edition" | "shadowless" | "unlimited" | "standard" | "unknown",
  "language": "English" | "Japanese" | "Other",
  "isSlab": true if the card is in a PSA/BGS/CGC/SGC/ACE/TAG case,
  "grade": "PSA 10" or null,
  "copyrightYear": 1999 if a © year is clearly printed, else null,
  "confidence": 0 to 1
}
Prefer the printed Pokémon name, not the attack names. If it is a trainer or energy, still return that name.
Do not guess set year or rarity — those come from the official catalog.
If you cannot read the card, still return JSON with nulls and low confidence.`;

/** Stable Gemini model with image input and structured output. gemini-2.0-flash is shut down. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** Google's other current recommendation for new projects. Also accepts images and JSON. */
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite";
/** Extra attempts after the first response, only for HTTP 429 and 503. */
export const GEMINI_RETRY_DELAYS_MS = [400, 800];

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const LOW_THINKING_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
]);

type FetchLike = typeof fetch;
type LogFn = (line: string) => void;

export type VisionDeps = {
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  log?: LogFn;
};

export type GeminiCallResult =
  | { ok: true; text: string }
  | { ok: false; status: number; errorMessage: string };

function asVariant(value: unknown): CardVariant {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("1st") || v.includes("first")) return "1st edition";
  if (v.includes("shadow")) return "shadowless";
  if (v.includes("reverse")) return "reverse";
  if (v.includes("holo")) return "holo";
  if (v.includes("unlimited")) return "unlimited";
  if (v.includes("standard")) return "standard";
  return "unknown";
}

function asLanguage(value: unknown): CardLanguage {
  const v = String(value ?? "");
  if (/japan/i.test(v)) return "Japanese";
  if (/english/i.test(v)) return "English";
  return /./.test(v) ? "Other" : "English";
}

function cleanJson(text: string): ExtractedCard {
  const match = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? text) as Record<string, unknown>;
  return {
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    set: typeof parsed.set === "string" ? parsed.set : undefined,
    collectorNumber:
      parsed.collectorNumber != null ? String(parsed.collectorNumber).replace(/^#/, "") : undefined,
    printedTotal: parsed.printedTotal != null ? String(parsed.printedTotal) : undefined,
    variant: asVariant(parsed.variant),
    language: asLanguage(parsed.language),
    isSlab: Boolean(parsed.isSlab),
    grade: typeof parsed.grade === "string" ? parsed.grade : null,
    copyrightYear: yearFromVision(parsed.copyrightYear),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };
}

function yearFromVision(value: unknown): number | undefined {
  const year = typeof value === "number" ? value : Number(String(value ?? "").match(/\b((?:19|20)\d{2})\b/)?.[1]);
  return isPlausibleTcgYear(year) ? year : undefined;
}

export function redactVisionLog(text: string, secrets: Array<string | undefined> = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join("[redacted]");
  }
  return out
    .replace(/key=[^&\s'"]+/gi, "key=[redacted]")
    .replace(/AIza[0-9A-Za-z\-_]{8,}/g, "[redacted]")
    .replace(/\bsk-[A-Za-z0-9]{8,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

export function providerErrorMessage(body: string, secrets: Array<string | undefined> = []): string {
  let message = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown; status?: unknown } };
    if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) {
      message = parsed.error.message.trim();
    } else if (typeof parsed.error?.status === "string" && parsed.error.status.trim()) {
      message = parsed.error.status.trim();
    }
  } catch {
    message = body.replace(/\s+/g, " ").trim().slice(0, 300);
  }
  const safe = redactVisionLog(message || "empty error body", secrets);
  return safe.slice(0, 300) || "empty error body";
}

function logVision(line: string, secrets: Array<string | undefined>, log: LogFn): void {
  log(redactVisionLog(line, secrets));
}

export function geminiModelConfig(env: NodeJS.ProcessEnv = process.env): {
  primary: string;
  fallback: string | null;
} {
  const primary = (env.GEMINI_MODEL ?? "").trim() || DEFAULT_GEMINI_MODEL;
  assertModelId(primary);
  const fallback = fallbackModel(env);
  if (!fallback || fallback === primary) return { primary, fallback: null };
  assertModelId(fallback);
  return { primary, fallback };
}

function fallbackModel(env: NodeJS.ProcessEnv): string | null {
  if (!Object.prototype.hasOwnProperty.call(env, "GEMINI_FALLBACK_MODEL")) {
    return DEFAULT_GEMINI_FALLBACK_MODEL;
  }
  const raw = (env.GEMINI_FALLBACK_MODEL ?? "").trim();
  return raw || null;
}

function assertModelId(model: string): void {
  if (!MODEL_ID.test(model)) {
    throw new Error("Photo recognition model is not a valid id.");
  }
}

function generationConfig(model: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    temperature: 0,
    responseMimeType: "application/json",
  };
  if (LOW_THINKING_MODELS.has(model)) {
    config.thinkingConfig = { thinkingLevel: "low" };
  }
  return config;
}

function geminiResponseText(body: string): string {
  const json = JSON.parse(body) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const texts = parts
    .filter((part) => part.thought !== true && typeof part.text === "string" && part.text.trim())
    .map((part) => part.text as string);
  return texts.find((text) => text.includes("{")) ?? texts[texts.length - 1] ?? "{}";
}

function readableVisionFailure(status: number): string {
  if (status === 429 || status === 503) return "Photo recognition is busy right now.";
  if (status === 404) return "Photo recognition model is unavailable.";
  return "Photo recognition is unavailable right now.";
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestGeminiModel(
  model: string,
  imageBytes: Buffer,
  mimeType: string,
  options: {
    apiKey: string;
    fetchImpl?: FetchLike;
    sleepImpl?: (ms: number) => Promise<void>;
    log?: LogFn;
  },
): Promise<GeminiCallResult> {
  assertModelId(model);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? defaultSleep;
  const log = options.log ?? ((line) => console.error(line));
  const secrets = [options.apiKey];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${options.apiKey}`;
  const maxAttempts = GEMINI_RETRY_DELAYS_MS.length + 1;
  let last: GeminiCallResult = { ok: false, status: 0, errorMessage: "empty error body" };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleepImpl(GEMINI_RETRY_DELAYS_MS[attempt - 1]);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType, data: imageBytes.toString("base64") } },
              ],
            },
          ],
          generationConfig: generationConfig(model),
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "network error";
      const errorMessage = redactVisionLog(message, secrets);
      logVision(`[vision] gemini model=${model} status=0 error=${errorMessage}`, secrets, log);
      return { ok: false, status: 0, errorMessage };
    }

    if (res.ok) {
      const body = await res.text();
      try {
        return { ok: true, text: geminiResponseText(body) };
      } catch {
        const errorMessage = "response was not card JSON";
        logVision(`[vision] gemini model=${model} status=${res.status} error=${errorMessage}`, secrets, log);
        return { ok: false, status: res.status, errorMessage };
      }
    }

    const body = await res.text();
    const errorMessage = providerErrorMessage(body, secrets);
    logVision(`[vision] gemini model=${model} status=${res.status} error=${errorMessage}`, secrets, log);
    last = { ok: false, status: res.status, errorMessage };
    if (res.status !== 429 && res.status !== 503) return last;
  }

  return last;
}

export async function identifyGemini(
  imageBytes: Buffer,
  mimeType: string,
  deps: VisionDeps = {},
): Promise<ExtractedCard> {
  const env = deps.env ?? process.env;
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Photo recognition is not configured.");
  const { primary, fallback } = geminiModelConfig(env);
  const models = [primary, ...(fallback ? [fallback] : [])];
  let lastStatus = 0;

  for (const model of models) {
    const result = await requestGeminiModel(model, imageBytes, mimeType, {
      apiKey,
      fetchImpl: deps.fetchImpl,
      sleepImpl: deps.sleepImpl,
      log: deps.log,
    });
    if (!result.ok) {
      lastStatus = result.status;
      continue;
    }
    try {
      return cleanJson(result.text);
    } catch {
      lastStatus = 200;
      logVision(
        `[vision] gemini model=${model} status=200 error=response was not card JSON`,
        [apiKey],
        deps.log ?? ((line) => console.error(line)),
      );
    }
  }

  throw new Error(readableVisionFailure(lastStatus));
}

export function visionProvider(): "openai" | "gemini" | null {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export async function identifyWithVision(
  imageBytes: Buffer,
  mimeType: string,
): Promise<ExtractedCard | null> {
  const provider = visionProvider();
  if (!provider) return null;
  if (provider === "openai") return identifyOpenAI(imageBytes, mimeType);
  return identifyGemini(imageBytes, mimeType);
}

async function identifyOpenAI(imageBytes: Buffer, mimeType: string): Promise<ExtractedCard> {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const dataUrl = `data:${mimeType};base64,${imageBytes.toString("base64")}`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    const errorMessage = providerErrorMessage(body, [apiKey]);
    console.error(`[vision] openai model=gpt-4o-mini status=${res.status} error=${errorMessage}`);
    throw new Error("Photo recognition is unavailable right now.");
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return cleanJson(json.choices?.[0]?.message?.content ?? "{}");
}
