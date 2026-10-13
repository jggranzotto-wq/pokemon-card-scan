import type { PriceSource, QuoteStatus } from "@/lib/prices/types";

type Point = { day: string; amountUsd: number | null; status: QuoteStatus };

const SERIES: { key: PriceSource; color: string; label: string }[] = [
  { key: "tcgplayer", color: "#ffcb05", label: "TCGPlayer" },
  { key: "collectr", color: "#3d8bfd", label: "Collectr" },
  { key: "ebay_sold", color: "#34d399", label: "eBay last sold" },
];

export function PriceChart({ history }: { history: Partial<Record<PriceSource, Point[]>> }) {
  const plotted = SERIES.map((series) => ({
    ...series,
    points: (history[series.key] ?? []).filter((point) => point.status === "ok" && point.amountUsd != null && point.amountUsd > 0),
  }));
  const all = plotted.flatMap((series) => series.points);
  if (!all.length) {
    return (
      <p className="rounded-2xl bg-ink-card px-4 py-3 text-sm text-paper-mute ring-1 ring-ink-line">
        No price history yet. A source that is not connected stays off this chart.
      </p>
    );
  }

  const days = Array.from(new Set(all.map((point) => point.day))).sort();
  const amounts = all.map((point) => point.amountUsd as number);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const width = 320;
  const height = 128;
  const pad = 10;
  const xFor = (day: string) => {
    const index = Math.max(0, days.indexOf(day));
    if (days.length === 1) return width / 2;
    return pad + (index / (days.length - 1)) * (width - pad * 2);
  };
  const yFor = (amount: number) => {
    if (max === min) return height / 2;
    return pad + (1 - (amount - min) / (max - min)) * (height - pad * 2);
  };

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price history" className="h-32 w-full">
        {plotted.map((series) => {
          if (!series.points.length) return null;
          const d = series.points
            .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.day).toFixed(1)} ${yFor(point.amountUsd as number).toFixed(1)}`)
            .join(" ");
          return <path key={series.key} d={d} fill="none" stroke={series.color} strokeWidth="2.5" strokeLinejoin="round" />;
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-xs text-paper-mute">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: series.color }} />
            {series.label}
            {plotted.find((item) => item.key === series.key)?.points.length
              ? ""
              : (history[series.key] ?? []).some((point) => point.status === "not_connected")
                ? " · not connected"
                : " · no price"}
          </span>
        ))}
      </figcaption>
      <p className="mt-1 text-xs text-paper-mute">
        {days[0]} to {days[days.length - 1]} · US$
      </p>
    </figure>
  );
}
