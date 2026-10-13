"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONDITIONS, VARIANTS, normalizeVariant } from "@/lib/card-fields";
import { apiFetch } from "@/lib/client-api";
import { readEbayAppId } from "@/lib/ebay-app-id";

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

export function SaveCardForm({
  catalogId,
  name,
  setName,
  setId,
  setYear,
  collectorNumber,
  printedNumber,
  rarity,
  variant,
  language,
  condition,
  imageUrl,
  photo,
}: {
  catalogId?: string;
  name: string;
  setName?: string;
  setId?: string;
  setYear?: number | null;
  collectorNumber?: string;
  printedNumber?: string;
  rarity?: string;
  variant?: string;
  language?: string;
  condition?: string;
  imageUrl?: string;
  photo?: Blob | null;
}) {
  const router = useRouter();
  const [finish, setFinish] = useState(normalizeVariant(variant));
  const [lang, setLang] = useState(language === "Japanese" || language === "Other" ? language : "English");
  const [cond, setCond] = useState(condition || "NM");
  const [customCondition, setCustomCondition] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [purchase, setPurchase] = useState("");
  const [currency, setCurrency] = useState<"CAD" | "USD">("CAD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const thumbnailBase64 = photo ? await blobToDataUrl(photo) : undefined;
      const response = await apiFetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogId,
          name,
          setName,
          setId,
          setYear,
          collectorNumber,
          printedNumber,
          rarity,
          variant: finish,
          language: lang,
          condition: cond === "Other" ? customCondition : cond,
          quantity,
          purchasePrice: purchase.trim() ? Number(purchase) : null,
          purchaseCurrency: currency,
          imageUrl,
          thumbnailBase64,
          ebayAppId: readEbayAppId(),
        }),
      });
      const body = (await response.json()) as { card?: { id: string }; error?: string; message?: string };
      if (!response.ok || !body.card) throw new Error(body.message || body.error || "Could not save.");
      router.push(`/card?id=${body.card.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-3xl bg-ink-card p-4 ring-1 ring-ink-line">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-paper-mute">Save to collection</h2>
      <p className="mt-1 text-sm text-paper-mute">Confirm the finish and condition, then save. Prices refresh right after.</p>
      <label className="mt-3 block text-sm">
        Variant
        <select value={finish} onChange={(event) => setFinish(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line">
          {VARIANTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm">
        Language
        <select value={lang} onChange={(event) => setLang(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line">
          <option>English</option>
          <option>Japanese</option>
          <option>Other</option>
        </select>
      </label>
      <label className="mt-3 block text-sm">
        Condition or grade
        <select value={CONDITIONS.includes(cond as (typeof CONDITIONS)[number]) ? cond : "Other"} onChange={(event) => setCond(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line">
          {CONDITIONS.map((item) => (
            <option key={item}>{item}</option>
          ))}
          <option>Other</option>
        </select>
      </label>
      {cond === "Other" || !CONDITIONS.includes(cond as (typeof CONDITIONS)[number]) ? (
        <input
          value={customCondition || (CONDITIONS.includes(cond as (typeof CONDITIONS)[number]) ? "" : cond)}
          onChange={(event) => {
            setCond("Other");
            setCustomCondition(event.target.value);
          }}
          placeholder="PSA 7, raw MP, ..."
          className="mt-2 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line"
        />
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-sm">
          Quantity
          <input
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line"
          />
        </label>
        <label className="text-sm">
          Purchase price (optional)
          <input
            inputMode="decimal"
            value={purchase}
            onChange={(event) => setPurchase(event.target.value)}
            placeholder="0.00"
            className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line"
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        Purchase currency
        <select value={currency} onChange={(event) => setCurrency(event.target.value === "USD" ? "USD" : "CAD")} className="mt-1 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line">
          <option value="CAD">CA$</option>
          <option value="USD">US$</option>
        </select>
      </label>
      {error ? <p className="mt-3 text-sm text-coral">{error}</p> : null}
      <button type="button" onClick={() => void save()} disabled={busy || !name} className="mt-4 min-h-14 w-full rounded-2xl bg-bolt font-semibold text-ink disabled:opacity-50">
        {busy ? "Saving…" : "Save card"}
      </button>
    </section>
  );
}
