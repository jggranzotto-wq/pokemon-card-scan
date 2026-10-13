import type { PriceSource, QuoteStatus } from "./types";

export type CardQuoteSlice = {
  quantity: number;
  status: QuoteStatus;
  amountUsd: number | null;
};

export type SourceTotal = {
  source: PriceSource;
  status: QuoteStatus | "partial" | "empty";
  totalUsd: number | null;
  pricedCount: number;
  cardCount: number;
  label: string;
};

const SOURCE_LABEL: Record<PriceSource, string> = {
  tcgplayer: "TCGPlayer market",
  collectr: "Collectr",
  ebay_sold: "eBay last sold",
};

export function rollupSource(source: PriceSource, cards: CardQuoteSlice[]): SourceTotal {
  const cardCount = cards.length;
  const label = SOURCE_LABEL[source];
  if (cardCount === 0) {
    return { source, status: "empty", totalUsd: null, pricedCount: 0, cardCount: 0, label };
  }

  const connected = cards.some((card) => card.status !== "not_connected");
  if (!connected) {
    return { source, status: "not_connected", totalUsd: null, pricedCount: 0, cardCount, label };
  }

  const priced = cards.filter(
    (card) => card.status === "ok" && card.amountUsd != null && Number.isFinite(card.amountUsd) && card.amountUsd >= 0,
  );
  if (priced.length === 0) {
    return { source, status: "unavailable", totalUsd: null, pricedCount: 0, cardCount, label };
  }

  const totalUsd = priced.reduce((sum, card) => sum + card.amountUsd! * Math.max(0, card.quantity), 0);
  return {
    source,
    status: priced.length === cardCount ? "ok" : "partial",
    totalUsd,
    pricedCount: priced.length,
    cardCount,
    label,
  };
}

export function changeSince(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 100) / 100;
}
