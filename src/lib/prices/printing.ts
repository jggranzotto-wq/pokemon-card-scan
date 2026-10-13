import { normalizeVariant } from "../card-fields";

export type MarketRow = {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
};

const PREFERRED: Record<string, string[]> = {
  "1st edition holo": ["1stEditionHolofoil", "1stEdition"],
  "1st edition": ["1stEditionNormal", "1stEdition", "1stEditionHolofoil"],
  "reverse holo": ["reverseHolofoil"],
  holo: ["holofoil", "unlimitedHolofoil"],
  shadowless: ["1stEditionHolofoil", "holofoil"],
  unlimited: ["unlimitedHolofoil", "unlimited", "normal"],
  standard: ["normal"],
  unknown: ["holofoil", "reverseHolofoil", "1stEditionHolofoil", "unlimitedHolofoil", "normal"],
};

export function printingLabel(key: string): string {
  const labels: Record<string, string> = {
    holofoil: "Holofoil",
    reverseHolofoil: "Reverse holofoil",
    "1stEditionHolofoil": "1st edition holofoil",
    "1stEditionNormal": "1st edition",
    "1stEdition": "1st edition",
    unlimitedHolofoil: "Unlimited holofoil",
    unlimited: "Unlimited",
    normal: "Normal",
  };
  return labels[key] ?? key;
}

function positiveMarket(row: MarketRow | undefined): number | null {
  const market = row?.market;
  return typeof market === "number" && Number.isFinite(market) && market > 0 ? market : null;
}

/**
 * Pick the TCGPlayer printing that matches the saved variant.
 * A holo price is never substituted when the saved variant is reverse holo, and the reverse.
 */
export function pickVariantPrice(
  prices: Record<string, MarketRow | undefined> | null | undefined,
  variant: string | null | undefined,
): { key: string; market: number; low?: number | null; mid?: number | null; high?: number | null } | null {
  if (!prices) return null;
  const normalized = normalizeVariant(variant);
  const keys = PREFERRED[normalized] ?? PREFERRED.unknown;
  for (const key of keys) {
    const market = positiveMarket(prices[key]);
    if (market != null) {
      const row = prices[key];
      return { key, market, low: row?.low, mid: row?.mid, high: row?.high };
    }
  }
  if (normalized !== "unknown") return null;
  for (const [key, row] of Object.entries(prices)) {
    const market = positiveMarket(row);
    if (market != null && row) return { key, market, low: row.low, mid: row.mid, high: row.high };
  }
  return null;
}
