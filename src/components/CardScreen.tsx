"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CONDITIONS, VARIANTS } from "@/lib/card-fields";
import { apiFetch } from "@/lib/client-api";
import { readEbayAppId } from "@/lib/ebay-app-id";
import { apiUrl } from "@/lib/api-origin";
import type { PriceSource, QuoteStatus } from "@/lib/prices/types";
import { MoneyPair, formatWhen } from "./Money";
import { PriceChart } from "./PriceChart";
import { TopNav } from "./TopNav";

type Quote = {
  source: PriceSource;
  status: QuoteStatus;
  amountUsd: number | null;
  label: string;
  detail: string | null;
  observedAt: string | null;
};

type Card = {
  id: string;
  name: string;
  setName: string | null;
  setYear: number | null;
  printedNumber: string | null;
  collectorNumber: string | null;
  variant: string;
  language: string;
  rarity: string | null;
  condition: string;
  quantity: number;
  purchasePrice: number | null;
  purchaseCurrency: "CAD" | "USD" | null;
  thumbnailUrl: string | null;
  prices: Quote[];
};

type History = Partial<Record<PriceSource, { day: string; amountUsd: number | null; status: QuoteStatus }[]>>;

function DetailText({ text }: { text: string }) {
  const parts = text.split(/(https:\/\/[^\s]+)/g);
  return (
    <p className="mt-2 text-sm text-paper-mute">
      {parts.map((part, index) =>
        part.startsWith("https://") ? (
          <a key={index} href={part} target="_blank" rel="noreferrer" className="text-sky underline">
            {part.replace(/^https:\/\//, "")}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

export function CardScreen() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [history, setHistory] = useState<History>({});
  const [rate, setRate] = useState(1.37);
  const [rateLabel, setRateLabel] = useState("approx CAD");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const response = await apiFetch(`/api/collection/${id}`);
    const body = (await response.json()) as {
      card?: Card;
      history?: History;
      fx?: { rate: number; label: string };
      error?: string;
      message?: string;
    };
    if (!response.ok || !body.card) {
      setError(body.message || body.error || "Could not open that card.");
      return;
    }
    setCard(body.card);
    setHistory(body.history ?? {});
    setRate(body.fx?.rate ?? 1.37);
    setRateLabel(body.fx?.label ?? "approx CAD");
    setError(null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Record<string, unknown>) {
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/collection/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, ebayAppId: readEbayAppId() }),
      });
      const body = (await response.json()) as { card?: Card; history?: History; error?: string; message?: string };
      if (!response.ok || !body.card) throw new Error(body.message || body.error || "Update failed.");
      setCard(body.card);
      if (body.history) setHistory(body.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!card) return;
    if (!window.confirm(`Remove ${card.name} from the collection?`)) return;
    const response = await apiFetch(`/api/collection/${card.id}`, { method: "DELETE" });
    if (response.ok) router.push("/");
  }

  if (!id) {
    return (
      <main className="mx-auto max-w-phone px-4 pt-6">
        <TopNav active="collection" />
        <p className="text-sm text-paper-mute">Choose a card from the collection.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-phone px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <TopNav active="collection" />
      {error ? <p className="mb-3 rounded-2xl bg-coral/15 px-4 py-3 text-sm text-coral">{error}</p> : null}
      {!card ? <p className="text-sm text-paper-mute">Loading card…</p> : null}
      {card ? (
        <>
          <div className="overflow-hidden rounded-3xl bg-ink-card ring-1 ring-ink-line">
            <div className="relative aspect-[3/4] bg-black/40">
              {card.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.thumbnailUrl.startsWith("http") ? card.thumbnailUrl : apiUrl(card.thumbnailUrl)}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          </div>
          <h1 className="mt-4 text-3xl font-semibold">{card.name}</h1>
          <p className="mt-1 text-sm text-paper-mute">
            {[card.printedNumber || card.collectorNumber, card.setName, card.setYear, card.rarity || "Unknown rarity"].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-paper-mute">{rateLabel}. CA$ is an estimate from US$.</p>

          <div className="mt-4 grid gap-3">
            {card.prices.map((price) => (
              <article key={price.source} className="rounded-2xl bg-ink-card p-4 ring-1 ring-ink-line">
                <h2 className="text-sm font-semibold text-paper-mute">{price.label}</h2>
                <p className="mt-1 text-xl font-semibold">
                  <MoneyPair amountUsd={price.status === "ok" ? price.amountUsd : null} rate={rate} status={price.status} />
                </p>
                <p className="mt-1 text-xs text-paper-mute">Updated {formatWhen(price.observedAt)}</p>
                {price.detail ? <DetailText text={price.detail} /> : null}
              </article>
            ))}
          </div>

          <section className="mt-4 rounded-2xl bg-ink-card p-4 ring-1 ring-ink-line">
            <h2 className="mb-2 text-sm font-semibold text-paper-mute">Price history</h2>
            <PriceChart history={history} />
          </section>

          <section className="mt-4 grid gap-3 rounded-2xl bg-ink-card p-4 ring-1 ring-ink-line">
            <label className="text-sm">
              Variant
              <select
                value={card.variant}
                disabled={busy}
                onChange={(event) => void save({ variant: event.target.value })}
                className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line"
              >
                {VARIANTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Condition or grade
              <select
                value={card.condition}
                disabled={busy}
                onChange={(event) => void save({ condition: event.target.value })}
                className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line"
              >
                {CONDITIONS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
                {CONDITIONS.includes(card.condition as (typeof CONDITIONS)[number]) ? null : <option>{card.condition}</option>}
              </select>
            </label>
            <label className="text-sm">
              Language
              <select
                value={card.language}
                disabled={busy}
                onChange={(event) => void save({ language: event.target.value })}
                className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line"
              >
                <option>English</option>
                <option>Japanese</option>
                <option>Other</option>
              </select>
            </label>
            <label className="text-sm">
              Quantity
              <input
                type="number"
                min={0}
                defaultValue={card.quantity}
                key={card.quantity}
                disabled={busy}
                onBlur={(event) => {
                  const next = Number(event.target.value);
                  if (next !== card.quantity) void save({ quantity: next, refresh: false });
                }}
                className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line"
              />
            </label>
            <p className="text-sm text-paper-mute">
              Paid{" "}
              {card.purchasePrice == null
                ? "not recorded"
                : `${card.purchaseCurrency === "USD" ? "US$" : "CA$"}${card.purchasePrice.toFixed(2)}`}
            </p>
          </section>

          <Link href={`/list?id=${card.id}`} className="mt-4 grid min-h-14 place-items-center rounded-2xl bg-bolt font-semibold text-ink">
            List on eBay
          </Link>
          <button type="button" onClick={() => void remove()} className="mt-3 min-h-12 w-full text-sm text-coral">
            Remove from collection
          </button>
        </>
      ) : null}
    </main>
  );
}
