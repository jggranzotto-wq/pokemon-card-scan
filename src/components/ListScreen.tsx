"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { apiUrl } from "@/lib/api-origin";
import { TopNav } from "./TopNav";

type Draft = {
  environment: "sandbox" | "production";
  title: string;
  description: string;
  price: number | null;
  currency: "USD" | "CAD";
  priceNote: string;
  quantity: number;
  sku: string;
  imageUrls: string[];
  itemSpecifics: Record<string, string>;
  sellerConnected: boolean;
  configured: boolean;
  warnings: string[];
};

export function ListScreen() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const [draft, setDraft] = useState<Draft | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ listingId: string; url: string | null; environment: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void apiFetch(`/api/collection/${id}/listing`)
      .then(async (response) => {
        const body = (await response.json()) as { draft?: Draft; error?: string; message?: string };
        if (!response.ok || !body.draft) throw new Error(body.message || body.error || "Could not draft the listing.");
        setDraft(body.draft);
        setTitle(body.draft.title);
        setDescription(body.draft.description);
        setPrice(body.draft.price == null ? "" : String(body.draft.price));
        setQuantity(body.draft.quantity);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not draft the listing."));
  }, [id]);

  async function post() {
    if (!draft || !confirm) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/collection/${id}/listing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          title,
          description,
          price: Number(price),
          currency: draft.currency,
          quantity,
        }),
      });
      const body = (await response.json()) as {
        result?: { listingId: string; url: string | null; environment: string };
        error?: string;
      };
      if (!response.ok || !body.result) throw new Error(body.error || "eBay did not accept the listing.");
      setResult(body.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "eBay did not accept the listing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-phone px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <TopNav active="collection" />
      <h1 className="text-3xl font-semibold">List on eBay</h1>
      <p className="mt-2 text-sm text-paper-mute">Review the draft. Nothing is posted until you confirm.</p>
      {error ? <p className="mt-3 rounded-2xl bg-coral/15 px-4 py-3 text-sm text-coral">{error}</p> : null}
      {result ? (
        <section className="mt-4 rounded-2xl bg-mint/15 p-4 text-sm">
          <p className="font-semibold">Posted to eBay {result.environment}.</p>
          <p className="mt-1">Listing id {result.listingId || "pending"}.</p>
          {result.url ? (
            <a className="mt-2 inline-block underline" href={result.url}>
              Open listing
            </a>
          ) : null}
        </section>
      ) : null}
      {draft && !result ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void post();
          }}
        >
          <div className={`rounded-2xl px-4 py-3 text-sm ${draft.environment === "production" ? "bg-coral/15 text-coral" : "bg-bolt/15 text-bolt"}`}>
            {draft.environment === "production" ? "Production. This posts a live listing." : "Sandbox. This posts a test listing, not a live one."}
          </div>
          {draft.warnings.map((warning) => (
            <p key={warning} className="rounded-2xl bg-ink-card px-4 py-3 text-sm text-paper-mute ring-1 ring-ink-line">
              {warning}
            </p>
          ))}
          {!draft.sellerConnected ? (
            <a href={apiUrl("/api/ebay/connect")} className="grid min-h-12 place-items-center rounded-2xl bg-ink-raised font-semibold ring-1 ring-ink-line">
              Connect eBay seller
            </a>
          ) : null}
          <label className="text-sm">
            Title
            <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl bg-ink-card px-3 ring-1 ring-ink-line" />
          </label>
          <p className="text-xs text-paper-mute">{title.length}/80</p>
          <label className="text-sm">
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} className="mt-1 w-full rounded-2xl bg-ink-card px-3 py-2 ring-1 ring-ink-line" />
          </label>
          <label className="text-sm">
            Price ({draft.currency === "CAD" ? "CA$" : "US$"})
            <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl bg-ink-card px-3 ring-1 ring-ink-line" />
          </label>
          <p className="text-xs text-paper-mute">{draft.priceNote}</p>
          <label className="text-sm">
            Quantity
            <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1 min-h-12 w-full rounded-2xl bg-ink-card px-3 ring-1 ring-ink-line" />
          </label>
          <div className="rounded-2xl bg-ink-card p-4 text-sm ring-1 ring-ink-line">
            <h2 className="font-semibold">Item specifics</h2>
            <dl className="mt-2 grid gap-1">
              {Object.entries(draft.itemSpecifics).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-paper-mute">{key}</dt>
                  <dd className="text-right">{value}</dd>
                </div>
              ))}
            </dl>
            {draft.imageUrls[0] ? <p className="mt-2 text-xs text-paper-mute">Photo: public catalog image.</p> : null}
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} className="mt-1 h-5 w-5" />
            <span>I reviewed this draft and want to post it to eBay {draft.environment}.</span>
          </label>
          <button type="submit" disabled={!confirm || busy || !draft.configured || !draft.sellerConnected} className="min-h-14 rounded-2xl bg-bolt font-semibold text-ink disabled:opacity-50">
            {busy ? "Posting…" : "Post listing"}
          </button>
        </form>
      ) : null}
    </main>
  );
}
