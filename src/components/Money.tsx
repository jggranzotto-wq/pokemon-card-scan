import { formatCad, formatUsd } from "@/lib/money";
import { missingPriceText, type QuoteStatus } from "@/lib/prices/types";

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "not yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function MoneyPair({
  amountUsd,
  rate,
  status,
}: {
  amountUsd: number | null;
  rate: number;
  status?: QuoteStatus | "partial" | "empty";
}) {
  if (amountUsd == null) {
    return <span>{status ? missingPriceText(status === "partial" || status === "empty" ? "unavailable" : status) : "Not connected"}</span>;
  }
  return (
    <span>
      {formatUsd(amountUsd)}
      <span className="text-paper-mute"> · {formatCad(amountUsd, rate)} est.</span>
    </span>
  );
}

export function changeLabel(changeUsd: number | null, rate: number): string | null {
  if (changeUsd == null) return null;
  if (changeUsd === 0) return "No change since yesterday";
  const sign = changeUsd > 0 ? "+" : "−";
  const amount = Math.abs(changeUsd);
  return `${sign}${formatUsd(amount)} · ${sign}${formatCad(amount, rate)} est. since yesterday`;
}
