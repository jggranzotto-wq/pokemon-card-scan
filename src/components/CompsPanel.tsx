"use client";

import { formatCad, formatUsd } from "@/lib/money";
import type { PriceBand, SoldsResponse } from "@/types/card";

function formatSoldDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(date);
}

function bandLabel(band: PriceBand | null, rate: number) {
  if (!band) return "No sales in this group.";
  return `${formatUsd(band.typicalLow)}–${formatUsd(band.typicalHigh)} typical · median ${formatUsd(band.median)} (${formatCad(band.median, rate)})`;
}

function moneyPair(amountUsd: number, rate: number): string {
  return `${formatUsd(amountUsd)} · ${formatCad(amountUsd, rate)}`;
}

function printingLabel(printing?: string): string | null {
  if (!printing) return null;
  if (printing === "holofoil") return "Holofoil";
  if (printing === "reverseHolofoil") return "Reverse holofoil";
  if (printing === "1stEditionHolofoil") return "1st edition holofoil";
  if (printing === "unlimitedHolofoil") return "Unlimited holofoil";
  if (printing === "normal") return "Normal";
  return printing;
}

export function CompsPanel({
  solds,
  preferRaw,
  hasAppId,
  onAddAppId,
}: {
  solds: SoldsResponse;
  preferRaw: boolean;
  hasAppId: boolean;
  onAddAppId: () => void;
}) {
  const market = solds.tcgplayer;
  const printing = printingLabel(market?.printing);
  const hasMarket = Boolean(
    market && [market.marketUsd, market.lowUsd, market.midUsd, market.highUsd].some((n) => typeof n === "number"),
  );

  return (
    <section key={solds.query} className="mt-4 safe-bottom">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-paper-mute">Comparables</h2>
      <div
        className={`rounded-2xl px-4 py-3 text-sm ${
          solds.source === "none" ? "bg-bolt/15 text-bolt" : "bg-mint/15 text-mint"
        }`}
      >
        {solds.sourceLabel}. {solds.rateLabel}.
      </div>

      {solds.message ? (
        <p className="mt-3 rounded-2xl bg-ink-card px-4 py-3 text-sm text-paper-mute ring-1 ring-ink-line">
          {solds.message}
        </p>
      ) : null}

      {hasMarket ? (
        <article className="mt-3 rounded-2xl bg-ink-card p-4 ring-1 ring-ink-line">
          <h3 className="text-sm font-semibold text-paper-mute">
            TCGPlayer market{printing ? ` · ${printing}` : ""}
          </h3>
          {typeof market?.marketUsd === "number" ? (
            <p className="mt-1 text-base font-semibold">{moneyPair(market.marketUsd, solds.usdCadRate)}</p>
          ) : null}
          <dl className="mt-3 grid gap-1.5 text-sm">
            {typeof market?.lowUsd === "number" ? (
              <div className="flex justify-between gap-3">
                <dt className="text-paper-mute">Low</dt>
                <dd>{moneyPair(market.lowUsd, solds.usdCadRate)}</dd>
              </div>
            ) : null}
            {typeof market?.midUsd === "number" ? (
              <div className="flex justify-between gap-3">
                <dt className="text-paper-mute">Mid</dt>
                <dd>{moneyPair(market.midUsd, solds.usdCadRate)}</dd>
              </div>
            ) : null}
            {typeof market?.highUsd === "number" ? (
              <div className="flex justify-between gap-3">
                <dt className="text-paper-mute">High</dt>
                <dd>{moneyPair(market.highUsd, solds.usdCadRate)}</dd>
              </div>
            ) : null}
          </dl>
          {market?.updatedAt ? (
            <p className="mt-2 text-xs text-paper-mute">Updated {market.updatedAt}</p>
          ) : null}
        </article>
      ) : null}

      {solds.sales.length > 0 ? (
        <div className="mt-3 grid gap-2">
          <article className="rounded-2xl bg-ink-card p-4 ring-1 ring-ink-line">
            <h3 className="text-sm font-semibold text-paper-mute">
              {preferRaw ? "Raw / ungraded eBay band" : "Typical eBay sold band"}
            </h3>
            <p className="mt-1 text-base">{bandLabel(preferRaw ? solds.raw : solds.typical, solds.usdCadRate)}</p>
          </article>
          {solds.graded ? (
            <article className="rounded-2xl bg-ink-card p-4 ring-1 ring-ink-line">
              <h3 className="text-sm font-semibold text-paper-mute">Graded eBay solds</h3>
              <p className="mt-1 text-base">{bandLabel(solds.graded, solds.usdCadRate)}</p>
            </article>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        {solds.sourceUrl ? (
          <a
            href={solds.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center justify-center rounded-2xl bg-sky font-semibold text-white"
          >
            Open TCGPlayer
          </a>
        ) : null}
        <a
          href={solds.priceChartingUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center rounded-2xl bg-ink-raised font-semibold ring-1 ring-ink-line"
        >
          Open PriceCharting
        </a>
        <a
          href={solds.ebaySearchUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center rounded-2xl bg-ink-raised font-semibold ring-1 ring-ink-line"
        >
          Open eBay sold search
        </a>
      </div>

      {!hasAppId ? (
        <button
          type="button"
          onClick={onAddAppId}
          className="mt-3 min-h-12 w-full text-sm font-medium text-paper-mute underline-offset-4 hover:underline"
        >
          Optional: add an eBay App ID for live sold listings
        </button>
      ) : solds.ebayStatus === "invalid" || solds.ebayStatus === "error" ? (
        <button
          type="button"
          onClick={onAddAppId}
          className="mt-3 min-h-12 w-full text-sm font-medium text-coral underline-offset-4 hover:underline"
        >
          {solds.ebayError || "Fix eBay App ID"}
        </button>
      ) : null}

      {solds.sales.length > 0 ? (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-paper-mute">
            Recent eBay solds
          </h3>
          <ul className="grid gap-2">
            {solds.sales.map((sale) => {
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium leading-snug">{sale.title}</p>
                    <p className="shrink-0 text-right font-semibold">
                      {formatUsd(sale.priceUsd)}
                      <span className="block text-xs font-normal text-paper-mute">
                        {formatCad(sale.priceUsd, solds.usdCadRate)}
                      </span>
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-paper-mute">
                    {formatSoldDate(sale.soldAt)} · {sale.grade}
                    {sale.url ? " · eBay" : ""}
                  </p>
                </>
              );
              return (
                <li key={sale.id} className="rounded-2xl bg-ink-card p-3 ring-1 ring-ink-line">
                  {sale.url ? (
                    <a href={sale.url} target="_blank" rel="noreferrer" className="block">
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
