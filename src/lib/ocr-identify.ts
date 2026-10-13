import { catalogHashDistances } from "./image-match";
import { decideOcrIdentification, OCR_UNCLEAR_MESSAGE } from "./ocr-match";
import { lookupOcrCandidates } from "./pokemon-tcg";
import type { ExtractedCard, IdentifyResponse, PokemonCard } from "../types/card";

export async function identifyOcrPhoto(input: {
  extracted: ExtractedCard;
  photo?: Buffer | null;
  notice?: string | null;
  visionAvailable?: boolean;
  lookup?: (extracted: ExtractedCard) => Promise<PokemonCard[]>;
  distancesFor?: (photo: Buffer, cards: PokemonCard[]) => Promise<Map<string, number>>;
}): Promise<IdentifyResponse> {
  const lookup = input.lookup ?? lookupOcrCandidates;
  const cards = await lookup(input.extracted);
  const distances =
    input.photo && input.photo.length
      ? await (input.distancesFor ?? catalogHashDistances)(input.photo, cards)
      : null;
  const decision = decideOcrIdentification({
    extracted: input.extracted,
    cards,
    distances,
  });
  if (decision.autoSelectedId) {
    const distance = distances?.get(decision.autoSelectedId);
    console.info(`[identify] image match ${decision.autoSelectedId} distance=${distance ?? "n/a"} auto=true`);
  } else if (decision.candidates.length) {
    console.info(`[identify] image match showing ${decision.candidates.length} cards`);
  }

  return {
    method: "ocr",
    extracted: input.extracted,
    candidates: decision.candidates,
    autoSelectedId: decision.autoSelectedId,
    visionAvailable: input.visionAvailable ?? false,
    message: decision.message ?? (decision.candidates.length ? undefined : OCR_UNCLEAR_MESSAGE),
    notice: input.notice || undefined,
  };
}
