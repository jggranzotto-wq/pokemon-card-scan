import { NextResponse } from "next/server";
import { parseOcrText } from "@/lib/ocr-parse";
import { lookupCards } from "@/lib/pokemon-tcg";
import { identifyWithVision, visionProvider } from "@/lib/vision";
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

async function identifyFromExtracted(
  extracted: ExtractedCard,
  method: IdentifyResponse["method"],
): Promise<IdentifyResponse> {
  const candidates = await lookupCards(extracted);
  const top = candidates[0];
  const second = candidates[1];
  const topScoreGap = top && second ? top.name !== second.name || top.printedNumber !== second.printedNumber : true;
  const numberOk =
    !extracted.collectorNumber ||
    (top && top.number.replace(/^0+/, "") === extracted.collectorNumber.replace(/^0+/, ""));
  const totalOk =
    !extracted.printedTotal ||
    (top && top.printedNumber.endsWith(`/${extracted.printedTotal}`));
  const nameOk = !extracted.name || (top && top.name.toLowerCase() === extracted.name.toLowerCase());
  const confident = Boolean(
    top &&
    (extracted.confidence ?? 0) >= 0.55 &&
    nameOk &&
    numberOk &&
    totalOk &&
    topScoreGap,
  );

  return {
    method,
    extracted,
    candidates,
    autoSelectedId: confident ? top.id : undefined,
    visionAvailable: Boolean(visionProvider()),
    message: candidates.length
      ? undefined
      : extracted.name
        ? "No catalog match. You can still load solds for this name."
        : "No match. Search by name or try another photo.",
  };
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

    if (visionProvider()) {
      try {
        const vision = await identifyWithVision(bytes, mimeType);
        if (vision?.name) {
          return NextResponse.json(await identifyFromExtracted(vision, "vision"));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Vision failed";
        return NextResponse.json(
          {
            method: "vision",
            extracted: {},
            candidates: [],
            visionAvailable: true,
            message,
          } satisfies IdentifyResponse,
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      method: "ocr",
      extracted: {},
      candidates: [],
      visionAvailable: false,
      message: "ocr-required",
    } satisfies IdentifyResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Identify failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
