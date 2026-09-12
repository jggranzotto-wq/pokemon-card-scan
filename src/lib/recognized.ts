import type { ExtractedCard, PokemonCard } from "../types/card";

export function collectorLabel(extract: ExtractedCard, card?: PokemonCard | null): string | undefined {
  if (card?.printedNumber) return card.printedNumber;
  if (extract.collectorNumber && extract.printedTotal) {
    return `${extract.collectorNumber}/${extract.printedTotal}`;
  }
  return card?.number || extract.collectorNumber;
}

export function recognizedLabel(extract: ExtractedCard, card?: PokemonCard | null): string {
  const name = card?.name || extract.name;
  const number = collectorLabel(extract, card);
  return [name, number].filter(Boolean).join(" ");
}
