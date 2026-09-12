import { isPlausibleCardName } from "./ocr-parse";
import type { ExtractedCard, PokemonCard } from "../types/card";

export const UNKNOWN_FIELD = "Unknown";

export type CardIdentity = {
  name: string;
  number: string;
  setName: string;
  year: string;
  rarity: string;
};

export function displayOrUnknown(value?: string | number | null): string {
  if (value == null) return UNKNOWN_FIELD;
  const text = String(value).trim();
  return text ? text : UNKNOWN_FIELD;
}

export function collectorLabel(extract: ExtractedCard, card?: PokemonCard | null): string | undefined {
  if (card?.printedNumber) return card.printedNumber;
  if (extract.collectorNumber && extract.printedTotal) {
    const num = /^\d+$/.test(extract.printedTotal)
      ? extract.collectorNumber
      : extract.collectorNumber.padStart(3, "0");
    return `${num}/${extract.printedTotal}`;
  }
  return card?.number || extract.collectorNumber;
}

function trustedName(extract: ExtractedCard, card?: PokemonCard | null): string | undefined {
  if (card?.name) return card.name;
  return isPlausibleCardName(extract.name) ? extract.name : undefined;
}

export function cardIdentity(extract: ExtractedCard, card?: PokemonCard | null): CardIdentity {
  return {
    name: displayOrUnknown(trustedName(extract, card)),
    number: displayOrUnknown(collectorLabel(extract, card)),
    setName: displayOrUnknown(card?.setName || extract.set),
    year: displayOrUnknown(card?.setYear ?? extract.copyrightYear),
    rarity: displayOrUnknown(card?.rarity),
  };
}

export function hasCardIdentity(extract: ExtractedCard, card?: PokemonCard | null): boolean {
  return Boolean(trustedName(extract, card) || card);
}

export function recognizedLabel(extract: ExtractedCard, card?: PokemonCard | null): string {
  const identity = cardIdentity(extract, card);
  return [identity.name, identity.number]
    .filter((value) => value !== UNKNOWN_FIELD)
    .join(" ");
}
