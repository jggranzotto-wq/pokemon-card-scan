import { lookupCards, getCardById } from "./pokemon-tcg";
import type { ExtractedCard, PokemonCard } from "../types/card";

export const NO_COMPS_MESSAGE =
  "No public comps for this card. It may be unofficial, custom, or a promo that marketplaces do not list.";

export const COMPS_BLOCKED_MESSAGE =
  "The public price source did not return data. Use the search links below instead of guessing a price.";

export type PublicComps = {
  found: boolean;
  card?: PokemonCard | null;
  tcgplayer?: PokemonCard["tcgplayer"];
  sourceUrl?: string;
  sourceLabel: string;
  message?: string;
};

export function printedTotalFrom(printedNumber?: string): string | undefined {
  const match = printedNumber?.match(/\/(.+)$/);
  return match?.[1];
}

export function hasPublicMarket(tp?: PokemonCard["tcgplayer"]): boolean {
  if (!tp) return false;
  return [tp.marketUsd, tp.lowUsd, tp.midUsd, tp.highUsd].some(
    (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
  );
}

export function priceChartingSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    type: "pokemon-cards",
  });
  return `https://www.pricecharting.com/search-products?${params.toString()}`;
}

function extractForLookup(input: {
  name: string;
  setName?: string;
  number?: string;
  printedNumber?: string;
  language?: string;
}): ExtractedCard {
  return {
    name: input.name,
    set: input.setName,
    collectorNumber: input.number,
    printedTotal: printedTotalFrom(input.printedNumber),
    language: input.language === "Japanese" || input.language === "English" || input.language === "Other"
      ? input.language
      : undefined,
  };
}

export async function fetchPublicComps(input: {
  cardId?: string;
  name: string;
  setName?: string;
  number?: string;
  printedNumber?: string;
  language?: string;
}): Promise<PublicComps> {
  try {
    let card = input.cardId ? await getCardById(input.cardId) : null;
    if (!card && input.name.trim()) {
      const hits = await lookupCards(extractForLookup(input));
      card = hits[0] ?? null;
    }
    if (card && !hasPublicMarket(card.tcgplayer)) {
      const fresh = await getCardById(card.id);
      if (fresh) card = fresh;
    }

    const tcgplayer = card?.tcgplayer
      ? {
          ...card.tcgplayer,
          url: card.tcgplayer.url || `https://prices.pokemontcg.io/tcgplayer/${card.id}`,
        }
      : undefined;
    if (hasPublicMarket(tcgplayer)) {
      return {
        found: true,
        card,
        tcgplayer,
        sourceUrl: tcgplayer?.url,
        sourceLabel: "TCGPlayer market via pokemontcg.io",
      };
    }

    return {
      found: false,
      card,
      sourceLabel: "No public market comps",
      message: NO_COMPS_MESSAGE,
    };
  } catch {
    return {
      found: false,
      sourceLabel: "Public comps unavailable",
      message: COMPS_BLOCKED_MESSAGE,
    };
  }
}
