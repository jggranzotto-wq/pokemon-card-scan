import { quantile } from "./money";
import type { PriceBand, SoldListing } from "../types/card";

export function bandFromSales(sales: SoldListing[]): PriceBand | null {
  const prices = sales
    .map((s) => s.priceUsd)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return null;

  const min = prices[0];
  const max = prices[prices.length - 1];
  const median = quantile(prices, 0.5);
  const typicalLow = quantile(prices, 0.25);
  const typicalHigh = quantile(prices, 0.75);

  return {
    count: prices.length,
    min,
    max,
    median,
    typicalLow,
    typicalHigh,
  };
}

export function summarizeSolds(sales: SoldListing[]): {
  raw: PriceBand | null;
  graded: PriceBand | null;
  typical: PriceBand | null;
} {
  const raw = sales.filter((s) => !s.isGraded);
  const graded = sales.filter((s) => s.isGraded);
  return {
    raw: bandFromSales(raw),
    graded: bandFromSales(graded),
    typical: bandFromSales(sales),
  };
}

export function ebaySoldSearchUrl(query: string): string {
  const params = new URLSearchParams({
    _nkw: query,
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "13",
  });
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

export function soldsQuery(input: {
  name: string;
  setName?: string;
  number?: string;
  printedNumber?: string;
  variant?: string;
  language?: string;
}): string {
  const number = input.printedNumber || input.number;
  const parts = [input.name];
  if (number) parts.push(number);
  parts.push("Pokemon");
  if (input.setName) parts.push(input.setName);
  if (input.variant && input.variant !== "unknown" && input.variant !== "standard") {
    parts.push(input.variant);
  }
  if (input.language === "Japanese") parts.push("Japanese");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
