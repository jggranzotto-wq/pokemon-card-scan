import type { ExtractedCard, PokemonCard } from "../types/card";
import { collectorLabel } from "./recognized";

/** Build the /api/solds body from this scan only — never mix in a previous card. */
export function soldsRequestBody(
  card: PokemonCard | null,
  extract: ExtractedCard,
  nameOverride?: string,
  ebayAppId?: string,
) {
  return {
    cardId: card?.id,
    name: (nameOverride || card?.name || extract.name || "").trim(),
    setName: card?.setName || extract.set,
    number: card?.number || extract.collectorNumber,
    printedNumber: collectorLabel(extract, card),
    variant: extract.variant,
    language: extract.language || card?.language,
    preferRaw: extract.isSlab !== true,
    ebayAppId: ebayAppId?.trim() || undefined,
  };
}
