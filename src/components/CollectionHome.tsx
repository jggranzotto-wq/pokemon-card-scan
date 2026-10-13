"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-origin";
import { apiFetch, readCollectionToken, writeCollectionToken } from "@/lib/client-api";
import { readEbayAppId } from "@/lib/ebay-app-id";
import type { QuoteStatus } from "@/lib/prices/types";
import { MoneyPair, changeLabel, formatWhen } from "./Money";
import { TopNav } from "./TopNav";

type Quote = {
  source: "tcgplayer" | "collectr" | "ebay_sold";
  status: QuoteStatus;
  amountUsd: number | null;
  label: string;
  detail: string | null;
  observedAt: string | null;
};

type CardRow = {
  id: string;
  name: string;
  setName: string | null;
  setYear: number | null;
  printedNumber: string | null;
  variant: string;
  quantity: number;
  thumbnailUrl: string | null;
  prices: Quote[];
};

type Total = {
  source: Quote["source"];
  status: QuoteStatus | "partial" | "empty";
  totalUsd: number | null;
  pricedCount: number;
  cardCount: number;
  label: string;
  changeUsd: number | null;
  updatedAt: string | null;
};

type Payload = {
  cards: CardRow[];
  totals: Total[];
  fx: { rate: number; label: string };
};

export function CollectionHome() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState(false);
  const [database, setDatabase] = useState(true);
  const [password, setPassword] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const response = await apiFetch("/api/collection");
    const body = (await response.json()) as Payload & { error?: string; message?: string };
    if (response.status === 401) {
      setAuth(true);
      setError(body.message || "Enter the collection password.");
      return;
    }
    if (response.status === 503) {
      setDatabase(false);
      setError(body.message || "Database is not configured.");
      return;
    }
    if (!response.ok) {
      setError(body.message || body.error || "Could not load the collection.");
      return;
    }
    setAuth(false);
    setDatabase(true);
    setError(null);
    setData(body);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await apiFetch("/api/collection/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ebayAppId: readEbayAppId() }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string; error?: string };
        throw new Error(body.message || body.error || "Refresh failed.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-phone px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <TopNav active="collection" />
      <header className="mb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-bolt">the midnightman</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Collection</h1>
        <p className="mt-2 text-sm text-paper-mute">
          Running totals use each source on its own. A source that is not connected is left blank.
        </p>
      </header>

      {auth ? (
        <form
          className="rounded-3xl bg-ink-card p-4 ring-1 ring-ink-line"
          onSubmit={(event) => {
            event.preventDefault();
            writeCollectionToken(password);
            void load();
          }}
        >
          <label className="block text-sm font-semibold" htmlFor="collection-password">
            Collection password
          </label>
          <p className="mt-1 text-sm text-paper-mute">This matches COLLECTION_PASSWORD on the server. It stays on this phone.</p>
          <input
            id="collection-password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              writeCollectionToken(event.target.value);
            }}
            className="mt-3 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line"
          />
          <button type="submit" className="mt-3 min-h-12 w-full rounded-2xl bg-bolt font-semibold text-ink">
            Unlock
          </button>
          {readCollectionToken() && error ? <p className="mt-3 text-sm text-coral">{error}</p> : null}
        </form>
      ) : null}

      {!database ? (
        <section className="rounded-3xl bg-ink-card p-4 text-sm ring-1 ring-ink-line">
          <h2 className="font-semibold">Database not connected</h2>
          <p className="mt-2 text-paper-mute">
            Set DATABASE_URL to a Postgres database, then restart. Scanning still works without it. See the README for Railway.
          </p>
        </section>
      ) : null}

      {error && database && !auth ? <p className="mb-3 rounded-2xl bg-coral/15 px-4 py-3 text-sm text-coral">{error}</p> : null}

      {data ? (
        <>
          <p className="mb-3 text-xs text-paper-mute">{data.fx.label}. CA$ figures are an estimate.</p>
          <div className="grid gap-3">
            {data.totals.map((total) => (
              <article key={total.source} className="rounded-3xl bg-ink-card p-4 ring-1 ring-ink-line">
                <h2 className="text-sm font-semibold text-paper-mute">{total.label}</h2>
                <p className="mt-1 text-2xl font-semibold">
                  <MoneyPair amountUsd={total.totalUsd} rate={data.fx.rate} status={total.status} />
                </p>
                {changeLabel(total.changeUsd, data.fx.rate) ? (
                  <p className="mt-1 text-sm text-paper-mute">{changeLabel(total.changeUsd, data.fx.rate)}</p>
                ) : (
                  <p className="mt-1 text-sm text-paper-mute">No previous day to compare yet.</p>
                )}
                <p className="mt-2 text-xs text-paper-mute">
                  {total.status === "partial"
                    ? `${total.pricedCount} of ${total.cardCount} cards priced. The rest are not counted as zero.`
                    : total.status === "not_connected"
                      ? "Connect this source in Settings."
                      : `Updated ${formatWhen(total.updatedAt)}`}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/scan" className="grid min-h-12 place-items-center rounded-2xl bg-bolt font-semibold text-ink">
              Scan a card
            </Link>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing || data.cards.length === 0}
              className="min-h-12 rounded-2xl bg-ink-raised font-semibold ring-1 ring-ink-line disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh prices"}
            </button>
          </div>

          <ul className="mt-5 grid gap-2">
            {data.cards.length === 0 ? (
              <li className="rounded-2xl bg-ink-card px-4 py-6 text-center text-sm text-paper-mute ring-1 ring-ink-line">
                No cards saved yet. Scan one, confirm the match, then save it.
              </li>
            ) : null}
            {data.cards.map((card) => {
              const tcg = card.prices.find((price) => price.source === "tcgplayer");
              return (
                <li key={card.id}>
                  <Link href={`/card?id=${card.id}`} className="flex min-h-20 items-center gap-3 rounded-2xl bg-ink-card px-3 py-2 ring-1 ring-ink-line">
                    {card.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.thumbnailUrl.startsWith("http") ? card.thumbnailUrl : apiUrl(card.thumbnailUrl)} alt="" className="h-16 w-12 rounded-md object-cover" />
                    ) : (
                      <div className="h-16 w-12 rounded-md bg-ink-raised" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {card.name}
                        {card.quantity > 1 ? ` × ${card.quantity}` : ""}
                      </span>
                      <span className="block truncate text-sm text-paper-mute">
                        {[card.printedNumber, card.setName, card.setYear, card.variant].filter(Boolean).join(" · ")}
                      </span>
                      <span className="mt-1 block text-sm">
                        <MoneyPair amountUsd={tcg?.amountUsd ?? null} rate={data.fx.rate} status={tcg?.status} />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </main>
  );
}
