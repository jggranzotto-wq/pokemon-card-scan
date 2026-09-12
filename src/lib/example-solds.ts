import { detectGrade } from "./grades";
import type { SoldListing } from "../types/card";

/**
 * Obviously-fake sample rows so the solds panel can render without API keys.
 * Never treat these as live market data.
 */
export function exampleSolds(name: string, setName?: string, number?: string): SoldListing[] {
  const label = [name, setName, number].filter(Boolean).join(" ");
  const rows = [
    { days: 3, price: 18, extra: "raw NM EXAMPLE" },
    { days: 6, price: 22, extra: "ungraded LP EXAMPLE" },
    { days: 9, price: 41, extra: "PSA 8 EXAMPLE" },
    { days: 12, price: 16, extra: "raw played EXAMPLE" },
    { days: 15, price: 27, extra: "raw NM EXAMPLE" },
    { days: 20, price: 55, extra: "PSA 9 EXAMPLE" },
  ];

  return rows.map((row, index) => {
    const title = `EXAMPLE — ${label} ${row.extra} (not a real sale)`;
    const { grade, isGraded } = detectGrade(title);
    const soldAt = new Date(Date.now() - row.days * 24 * 60 * 60 * 1000).toISOString();
    return {
      id: `example-${index}`,
      title,
      priceUsd: row.price,
      soldAt,
      grade,
      isGraded,
      url: undefined,
    };
  });
}
