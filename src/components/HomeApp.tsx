"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compressImage, readCardText, SAMPLE_CARD } from "@/lib/client-image";
import { formatCad, formatUsd } from "@/lib/money";
import type {
  ExtractedCard,
  IdentifyResponse,
  PokemonCard,
  SoldsResponse,
  StatusResponse,
} from "@/types/card";

type Phase = "idle" | "working" | "candidates" | "solds";

function formatSoldDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(date);
}

function bandLabel(band: { min: number; max: number; median: number; typicalLow: number; typicalHigh: number } | null, rate: number) {
  if (!band) return "No sales in this group.";
  return `${formatUsd(band.typicalLow)}–${formatUsd(band.typicalHigh)} typical · median ${formatUsd(band.median)} (${formatCad(band.median, rate)})`;
}

export function HomeApp() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedCard>({});
  const [candidates, setCandidates] = useState<PokemonCard[]>([]);
  const [selected, setSelected] = useState<PokemonCard | null>(null);
  const [solds, setSolds] = useState<SoldsResponse | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void fetch("/api/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const preferRaw = !extracted.isSlab;

  const modeNote = useMemo(() => {
    if (!status) return "Checking lookup options…";
    const id = status.vision ? "Vision ID on" : "OCR + pokemontcg.io (no vision key)";
    const sold = status.ebay ? "Live eBay solds" : "Example solds until EBAY_APP_ID is set";
    return `${id} · ${sold}`;
  }, [status]);

  async function identifyBlob(blob: Blob, previewUrl: string) {
    setError(null);
    setSolds(null);
    setSelected(null);
    setCandidates([]);
    setPhase("working");
    setProgress("Sending photo…");
    setPreview(previewUrl);

    const form = new FormData();
    form.append("image", blob, "card.jpg");
    const res = await fetch("/api/identify", { method: "POST", body: form });
    const data = (await res.json()) as IdentifyResponse & { error?: string };
    if (!res.ok && data.message !== "ocr-required") {
      throw new Error(data.error || data.message || "Could not identify that card.");
    }

    if (data.message === "ocr-required" || (!data.candidates?.length && !data.extracted?.name)) {
      const text = await readCardText(blob, setProgress);
      setProgress("Matching the card…");
      const ocrRes = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const ocrData = (await ocrRes.json()) as IdentifyResponse & { error?: string };
      if (!ocrRes.ok) throw new Error(ocrData.error || "OCR match failed.");
      await applyIdentify(ocrData);
      return;
    }

    await applyIdentify(data);
  }

  async function applyIdentify(data: IdentifyResponse) {
    setExtracted(data.extracted ?? {});
    setCandidates(data.candidates ?? []);
    const auto = data.candidates?.find((card) => card.id === data.autoSelectedId) ?? null;
    if (auto) {
      setSelected(auto);
      await loadSolds(auto, data.extracted);
      return;
    }
    setPhase("candidates");
    setProgress("");
    if (!data.candidates?.length && data.extracted?.name) {
      await loadSolds(null, data.extracted);
      return;
    }
    if (!data.candidates?.length) {
      setError(data.message || "No match. Search by name or try another photo.");
    }
  }

  async function loadSolds(card: PokemonCard | null, extract = extracted, nameOverride?: string) {
    setPhase("working");
    setProgress("Fetching sold prices…");
    const res = await fetch("/api/solds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: card?.id,
        name: nameOverride || card?.name || extract.name,
        setName: card?.setName || extract.set,
        number: card?.number || extract.collectorNumber,
        variant: extract.variant,
        language: extract.language || card?.language,
        preferRaw: !extract.isSlab,
      }),
    });
    const data = (await res.json()) as SoldsResponse & { error?: string };
    if (!res.ok) throw new Error(data.error || "Could not load solds.");
    setSolds(data);
    setPhase("solds");
    setProgress("");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const blob = await compressImage(file);
      const url = URL.createObjectURL(blob);
      await identifyBlob(blob, url);
    } catch (err) {
      setPhase("idle");
      setProgress("");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function onSample() {
    try {
      setError(null);
      setPreview(SAMPLE_CARD.image);
      setPhase("working");
      setProgress("Matching sample card…");
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: SAMPLE_CARD.text }),
      });
      const data = (await res.json()) as IdentifyResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "Sample identify failed.");
      await applyIdentify(data);
    } catch (err) {
      setPhase("idle");
      setProgress("");
      setError(err instanceof Error ? err.message : "Sample failed.");
    }
  }

  async function onManualSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!search.trim()) return;
    try {
      setError(null);
      setPhase("working");
      setProgress("Searching cards…");
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted: { name: search.trim() } }),
      });
      const data = (await res.json()) as IdentifyResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "Search failed.");
      await applyIdentify(data);
    } catch (err) {
      setPhase("candidates");
      setProgress("");
      setError(err instanceof Error ? err.message : "Search failed.");
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-phone px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-5">
        <p className="text-xs uppercase tracking-[0.2em] text-bolt">the midnightman</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Card Scan</h1>
        <p className="mt-1 text-sm text-paper-mute">
          Photo a Pokémon card. We ID it, then show recent eBay solds in USD and approx CAD.
        </p>
        <p className="mt-2 text-xs text-paper-mute">{modeNote}</p>
      </header>

      <section className="overflow-hidden rounded-3xl bg-ink-card shadow-pad ring-1 ring-ink-line">
        <div className="relative aspect-[3/4] bg-black/40">
          {preview ? (
            // Official TCG images and local blobs only.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Card preview" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-ink-raised text-2xl">📷</div>
              <p className="text-sm text-paper-mute">
                Fill the frame with the card. Raw / ungraded is assumed unless the photo is clearly a slab.
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="mt-4 grid gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="min-h-14 rounded-2xl bg-bolt px-4 text-lg font-semibold text-ink active:scale-[0.99]"
        >
          Take photo
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="min-h-14 rounded-2xl bg-ink-raised px-4 text-lg font-semibold ring-1 ring-ink-line active:scale-[0.99]"
        >
          Choose from gallery
        </button>
        <button
          type="button"
          onClick={() => void onSample()}
          className="min-h-12 text-sm font-medium text-paper-mute underline-offset-4 hover:underline"
        >
          Try a sample Charizard
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />

      <form onSubmit={(event) => void onManualSearch(event)} className="mt-5 flex gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Or search name / number"
          className="min-h-12 flex-1 rounded-2xl bg-ink-card px-4 text-base ring-1 ring-ink-line outline-none placeholder:text-paper-mute"
        />
        <button type="submit" className="min-h-12 rounded-2xl bg-sky px-4 font-semibold text-white">
          Search
        </button>
      </form>

      {progress ? (
        <p className="mt-4 rounded-2xl bg-ink-card px-4 py-3 text-sm text-bolt">{progress}</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl bg-coral/15 px-4 py-3 text-sm text-coral">{error}</p>
      ) : null}

      {extracted.name || extracted.collectorNumber ? (
        <p className="mt-4 text-sm text-paper-mute">
          Read as {extracted.name ?? "unknown"}
          {extracted.set ? ` · ${extracted.set}` : ""}
          {extracted.collectorNumber ? ` · ${extracted.collectorNumber}${extracted.printedTotal ? `/${extracted.printedTotal}` : ""}` : ""}
          {extracted.variant && extracted.variant !== "unknown" ? ` · ${extracted.variant}` : ""}
          {extracted.language ? ` · ${extracted.language}` : ""}
          {extracted.isSlab ? " · slab" : " · treating as raw"}
        </p>
      ) : null}

      {candidates.length > 0 && phase !== "working" ? (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-paper-mute">
            Tap to confirm
          </h2>
          <ul className="grid gap-2">
            {candidates.map((card) => {
              const active = selected?.id === card.id;
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(card);
                      void loadSolds(card).catch((err) => {
                        setError(err instanceof Error ? err.message : "Solds failed.");
                        setPhase("candidates");
                      });
                    }}
                    className={`flex w-full min-h-20 items-center gap-3 rounded-2xl px-3 py-2 text-left ring-1 ${
                      active ? "bg-sky/20 ring-sky" : "bg-ink-card ring-ink-line"
                    }`}
                  >
                    {card.images.small ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.images.small} alt="" className="h-16 w-12 rounded-md object-cover" />
                    ) : (
                      <div className="h-16 w-12 rounded-md bg-ink-raised" />
                    )}
                    <span>
                      <span className="block font-semibold">{card.name}</span>
                      <span className="block text-sm text-paper-mute">
                        {card.setName} · {card.printedNumber}
                        {card.rarity ? ` · ${card.rarity}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {selected && phase === "solds" ? (
        <section className="mt-6 rounded-3xl bg-ink-card p-4 ring-1 ring-ink-line">
          <div className="flex gap-3">
            {selected.images.small ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.images.small} alt="" className="h-24 w-[4.4rem] rounded-lg object-cover" />
            ) : null}
            <div>
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <p className="text-sm text-paper-mute">
                {selected.setName} · {selected.printedNumber}
                {selected.rarity ? ` · ${selected.rarity}` : ""}
              </p>
              <p className="text-xs text-paper-mute">{selected.language}</p>
            </div>
          </div>
        </section>
      ) : null}

      {solds ? (
        <section className="mt-4 safe-bottom">
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              solds.demo ? "bg-bolt/15 text-bolt" : "bg-mint/15 text-mint"
            }`}
          >
            {solds.demo ? "Example data — not live solds. " : null}
            {solds.sourceLabel}. {solds.rateLabel}.
          </div>

          <div className="mt-3 grid gap-2">
            <article className="rounded-2xl bg-ink-card p-4 ring-1 ring-ink-line">
              <h3 className="text-sm font-semibold text-paper-mute">
                {preferRaw ? "Raw / ungraded band" : "Typical sold band"}
              </h3>
              <p className="mt-1 text-base">{bandLabel(preferRaw ? solds.raw : solds.typical, solds.usdCadRate)}</p>
            </article>
            {solds.graded ? (
              <article className="rounded-2xl bg-ink-card p-4 ring-1 ring-ink-line">
                <h3 className="text-sm font-semibold text-paper-mute">Graded solds</h3>
                <p className="mt-1 text-base">{bandLabel(solds.graded, solds.usdCadRate)}</p>
              </article>
            ) : null}
            {solds.tcgplayer?.marketUsd ? (
              <article className="rounded-2xl bg-ink-card p-4 ring-1 ring-ink-line">
                <h3 className="text-sm font-semibold text-paper-mute">TCGPlayer market (not eBay solds)</h3>
                <p className="mt-1 text-base">
                  {formatUsd(solds.tcgplayer.marketUsd)} · {formatCad(solds.tcgplayer.marketUsd, solds.usdCadRate)}
                </p>
              </article>
            ) : null}
          </div>

          <a
            href={solds.ebaySearchUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex min-h-12 items-center justify-center rounded-2xl bg-sky font-semibold text-white"
          >
            Open eBay sold search
          </a>

          <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-paper-mute">
            Recent solds
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
        </section>
      ) : null}
    </main>
  );
}
