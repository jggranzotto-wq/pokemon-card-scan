export const PRICE_SOURCES = ["tcgplayer", "collectr", "ebay_sold"] as const;

export type PriceSource = (typeof PRICE_SOURCES)[number];

export type QuoteStatus = "ok" | "not_connected" | "unavailable" | "error";

export type PriceQuote = {
  source: PriceSource;
  status: QuoteStatus;
  /** USD amount when status is ok. Missing sources stay null — never a fake zero. */
  amountUsd: number | null;
  label: string;
  detail: string | null;
  /** Collectr product id when a catalog match is confident enough to reuse. */
  externalId?: string | null;
};

export type PriceInput = {
  catalogId?: string | null;
  collectrProductId?: string | null;
  name: string;
  setName?: string | null;
  setId?: string | null;
  number?: string | null;
  printedNumber?: string | null;
  variant?: string | null;
  language?: string | null;
  condition?: string | null;
};

export function okQuote(
  source: PriceSource,
  amountUsd: number,
  label: string,
  detail: string | null = null,
  externalId: string | null = null,
): PriceQuote {
  return { source, status: "ok", amountUsd, label, detail, externalId };
}

export function closedQuote(
  source: PriceSource,
  status: Exclude<QuoteStatus, "ok">,
  label: string,
  detail: string | null = null,
): PriceQuote {
  return { source, status, amountUsd: null, label, detail, externalId: null };
}

export function errorQuote(source: PriceSource, error: unknown): PriceQuote {
  const message = error instanceof Error ? error.message : "Price lookup failed.";
  return closedQuote(source, "error", "Price lookup failed.", message);
}

export function missingPriceText(status: QuoteStatus): string {
  if (status === "not_connected") return "Not connected";
  if (status === "unavailable") return "No price";
  if (status === "error") return "Could not refresh";
  return "Not connected";
}
