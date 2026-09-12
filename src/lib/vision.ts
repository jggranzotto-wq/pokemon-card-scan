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
  "confidence": 0 to 1
}
Prefer the printed Pokémon name, not the attack names. If it is a trainer or energy, still return that name.
If you cannot read the card, still return JSON with nulls and low confidence.`;

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
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };
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
  const dataUrl = `data:${mimeType};base64,${imageBytes.toString("base64")}`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
    throw new Error(`OpenAI vision failed (${res.status})`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return cleanJson(json.choices?.[0]?.message?.content ?? "{}");
}

async function identifyGemini(imageBytes: Buffer, mimeType: string): Promise<ExtractedCard> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBytes.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini vision failed (${res.status})`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return cleanJson(text);
}
