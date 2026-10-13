import { NextResponse } from "next/server";
import { noManualMatchMessage } from "@/lib/catalog";
import { isPlausibleCardName, parseOcrText, READ_FAIL_MESSAGE } from "@/lib/ocr-parse";
import { lookupCards } from "@/lib/pokemon-tcg";
import { prepareUploadImage } from "@/lib/prepare-upload";
import { ocrCardImage } from "@/lib/server-ocr";
import { VISION_UNAVAILABLE_NOTE, VISION_UNREAD_NOTE, withVisionFallbackNote } from "@/lib/vision-messages";
import { identifyWithVision, redactVisionLog, visionProvider } from "@/lib/vision";
import type { ExtractedCard, IdentifyResponse } from "@/types/card";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024;

function mergeExtracted(base: ExtractedCard, extra?: ExtractedCard): ExtractedCard {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(extra ?? {}).filter(([, value]) => value != null && value !== "")),
  };
}

function unreadResponse(ocrText?: string): IdentifyResponse {
  return {
    method: "ocr",
    extracted: { ocrText, language: undefined },
    candidates: [],
    visionAvailable: Boolean(visionProvider()),
    message: READ_FAIL_MESSAGE,
  };
}

async function identifyFromExtracted(
  extracted: ExtractedCard,
  method: IdentifyResponse["method"],
): Promise<IdentifyResponse> {
  if (!isPlausibleCardName(extracted.name) && !extracted.collectorNumber) {
    return unreadResponse(extracted.ocrText);
  }
  if (!isPlausibleCardName(extracted.name)) {
    extracted = { ...extracted, name: undefined };
  }

  const candidates = extracted.name ? await lookupCards(extracted) : [];
  const top = candidates[0];
  const second = candidates[1];
  const topScoreGap = top && second ? top.name !== second.name || top.printedNumber !== second.printedNumber : true;
  const numberOk =
    !extracted.collectorNumber ||
    (top && top.number.replace(/^0+/, "") === extracted.collectorNumber.replace(/^0+/, ""));
  const totalOk =
    !extracted.printedTotal ||
    (top &&
      (top.printedNumber.endsWith(`/${extracted.printedTotal}`) ||
        top.setId.toLowerCase() === extracted.printedTotal.toLowerCase()));
  const nameOk = !extracted.name || (top && top.name.toLowerCase() === extracted.name.toLowerCase());
  const uniquePrinting = candidates.length === 1;
  const confident = Boolean(
    top &&
    (extracted.confidence ?? 0) >= 0.55 &&
    nameOk &&
    numberOk &&
    totalOk &&
    topScoreGap,
  );
  const manual = (extracted.confidence ?? 0) >= 0.9;

  return {
    method,
    extracted,
    candidates,
    autoSelectedId: uniquePrinting && top ? top.id : confident && !manual ? top.id : undefined,
    visionAvailable: Boolean(visionProvider()),
    message: candidates.length
      ? candidates.length > 1
        ? "Several printings match. Tap the number, set, and rarity on your card."
        : undefined
      : extracted.name
        ? extracted.set || extracted.setYear
          ? noManualMatchMessage({
              name: extracted.name,
              year: extracted.setYear,
              setName: extracted.set,
            })
          : "No catalog match for that name. You can still use the printed name."
        : READ_FAIL_MESSAGE,
  };
}

async function identifyFromImageBytes(bytes: Buffer, mimeType: string): Promise<IdentifyResponse> {
  let visionNote: string | null = null;
  if (visionProvider()) {
    try {
      const vision = await identifyWithVision(bytes, mimeType);
      if (isPlausibleCardName(vision?.name)) {
        return identifyFromExtracted(vision!, "vision");
      }
      visionNote = VISION_UNREAD_NOTE;
      console.error("[vision] photo recognition returned no card name; using OCR");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Vision failed";
      console.error(
        `[vision] photo recognition failed; using OCR (${redactVisionLog(detail, [
          process.env.GEMINI_API_KEY,
          process.env.OPENAI_API_KEY,
        ])})`,
      );
      visionNote = VISION_UNAVAILABLE_NOTE;
    }
  }

  const englishText = await ocrCardImage(bytes, "eng");
  let extracted = parseOcrText(englishText);
  const englishWeak =
    !isPlausibleCardName(extracted.name) ||
    (extracted.confidence ?? 0) < 0.85 ||
    extracted.language === "Japanese";
  if (englishWeak) {
    const japaneseText = await ocrCardImage(bytes, "jpn");
    const japanese = parseOcrText(japaneseText);
    const japaneseBetter =
      (japanese.confidence ?? 0) > (extracted.confidence ?? 0) ||
      (japanese.language === "Japanese" && isPlausibleCardName(japanese.name));
    if (japaneseBetter) extracted = japanese;
  }
  const identified = await identifyFromExtracted(extracted, "ocr");
  if (!visionNote) return identified;
  return { ...identified, message: withVisionFallbackNote(visionNote, identified.message) };
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { text?: string; extracted?: ExtractedCard };
      const fromText = body.text ? parseOcrText(body.text) : {};
      const extracted = mergeExtracted(fromText, body.extracted);
      if (!extracted.name && !extracted.collectorNumber && !extracted.ocrText && !body.text) {
        return NextResponse.json({ error: "Send card text or a name." }, { status: 400 });
      }
      if (body.extracted?.name && !extracted.name) {
        extracted.name = isPlausibleCardName(body.extracted.name) ? body.extracted.name : undefined;
      }
      return NextResponse.json(await identifyFromExtracted(extracted, "text"));
    }

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a photo first." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Photo is too large. Try another shot." }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/jpeg";

    // Tesseract workers hang on Vercel serverless until the 60s limit.
    // The phone reads the photo instead, using language files from this origin.
    if (process.env.VERCEL && !visionProvider()) {
      return NextResponse.json({
        method: "ocr",
        extracted: {},
        candidates: [],
        visionAvailable: false,
        message: "ocr-required",
      } satisfies IdentifyResponse);
    }

    let prepared;
    try {
      prepared = await prepareUploadImage(bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read that photo.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.info(
      `[identify] photo ${bytes.length}B ${mimeType} -> ${prepared.bytes.length}B ${prepared.width}x${prepared.height} jpeg`,
    );

    return NextResponse.json(await identifyFromImageBytes(prepared.bytes, prepared.mimeType));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Identify failed";
    return NextResponse.json({ error: message, message: READ_FAIL_MESSAGE }, { status: 500 });
  }
}
