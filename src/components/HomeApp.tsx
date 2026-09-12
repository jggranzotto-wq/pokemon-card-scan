"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EbaySetup } from "@/components/EbaySetup";
import { compressImage, preloadOcr, readCardText, SAMPLE_CARD } from "@/lib/client-image";
import {
  clearEbayAppId,
  markEbaySetupSeen,
  readEbayAppId,
  readEbaySetupSeen,
  shouldShowEbaySetupOnLaunch,
  writeEbayAppId,
} from "@/lib/ebay-app-id";
import { CardIdentityPanel } from "@/components/CardIdentity";
import { CompsPanel } from "@/components/CompsPanel";
import { isPlausibleCardName, parseOcrText, READ_FAIL_MESSAGE } from "@/lib/ocr-parse";
import { cardIdentity, hasCardIdentity, recognizedLabel } from "@/lib/recognized";
import { createScanGuard } from "@/lib/scan-guard";
import { soldsRequestBody } from "@/lib/solds-request";
import type {
  ExtractedCard,
  IdentifyResponse,
  PokemonCard,
  SoldsResponse,
  StatusResponse,
} from "@/types/card";

type Phase = "idle" | "working" | "candidates" | "solds";

export function HomeApp() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const scansRef = useRef(createScanGuard());
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
  const [ready, setReady] = useState(false);
  const [appId, setAppId] = useState("");
  const [showSetup, setShowSetup] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    const saved = readEbayAppId();
    setAppId(saved);
    setShowSetup(shouldShowEbaySetupOnLaunch(saved, readEbaySetupSeen()));
    setReady(true);
    void fetch("/api/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus(null));
    void preloadOcr();
  }, []);

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const preferRaw = !extracted.isSlab;
  const identity = cardIdentity(extracted, selected);
  const showIdentity = hasCardIdentity(extracted, selected);
  const recognized = recognizedLabel(extracted, selected);
  const identityNote = [
    extracted.variant && extracted.variant !== "unknown" ? extracted.variant : null,
    extracted.language || selected?.language,
    extracted.isSlab ? "slab" : recognized ? "treating as raw" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const modeNote = useMemo(() => {
    const id = status?.vision ? "Vision ID on" : "OCR reads the card photo (not the filename)";
    return appId
      ? `${id} · Public comps plus eBay solds from your App ID`
      : `${id} · Public comps after ID. No eBay login.`;
  }, [status, appId]);

  function beginScan() {
    const scan = scansRef.current.begin();
    setError(null);
    setSolds(null);
    setSelected(null);
    setCandidates([]);
    setExtracted({});
    setPhase("working");
    return scan;
  }

  async function identifyBlob(blob: Blob, previewUrl: string) {
    const scan = beginScan();
    try {
      setProgress("Sending photo…");
      setPreview(previewUrl);

      const form = new FormData();
      form.append("image", blob, "card.jpg");
      const res = await fetch("/api/identify", { method: "POST", body: form, cache: "no-store" });
      const data = (await res.json()) as IdentifyResponse & { error?: string };
      if (!scansRef.current.isCurrent(scan)) return;
      if (!res.ok && data.message !== "ocr-required") {
        throw new Error(data.error || data.message || "Could not identify that card.");
      }

      if (data.message === "ocr-required") {
        setProgress("Reading the card on this phone…");
        const readWithTimeout = (lang: "eng" | "jpn") =>
          Promise.race([
            readCardText(
              blob,
              (status) => {
                if (scansRef.current.isCurrent(scan)) setProgress(status);
              },
              lang,
            ),
            new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error(READ_FAIL_MESSAGE)), 25_000);
            }),
          ]);
        let text = await readWithTimeout("eng");
        if (!isPlausibleCardName(parseOcrText(text).name)) {
          try {
            const japanese = await readWithTimeout("jpn");
            if (
              isPlausibleCardName(parseOcrText(japanese).name) ||
              parseOcrText(japanese).language === "Japanese"
            ) {
              text = japanese;
            }
          } catch {
            // Keep the English read; the server will reject garbage names.
          }
        }
        if (!scansRef.current.isCurrent(scan)) return;
        setProgress("Matching the card…");
        const ocrRes = await fetch("/api/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ text }),
        });
        const ocrData = (await ocrRes.json()) as IdentifyResponse & { error?: string };
        if (!scansRef.current.isCurrent(scan)) return;
        if (!ocrRes.ok) throw new Error(ocrData.error || READ_FAIL_MESSAGE);
        await applyIdentify(ocrData, scan);
        return;
      }

      await applyIdentify(data, scan);
    } catch (err) {
      if (!scansRef.current.isCurrent(scan)) return;
      throw err;
    }
  }

  async function applyIdentify(data: IdentifyResponse, scan: number) {
    if (!scansRef.current.isCurrent(scan)) return;
    const extract = {
      ...(data.extracted ?? {}),
      name: isPlausibleCardName(data.extracted?.name) ? data.extracted?.name : undefined,
    };
    setExtracted(extract);
    setCandidates(data.candidates ?? []);
    const auto = data.candidates?.find((card) => card.id === data.autoSelectedId) ?? null;
    if (auto) {
      setSelected(auto);
      await finishAfterIdentify(auto, extract, scan);
      return;
    }
    if (!scansRef.current.isCurrent(scan)) return;
    setPhase("candidates");
    setProgress("");
    if (!data.candidates?.length && extract.name) {
      await finishAfterIdentify(null, extract, scan);
      if (data.message) setError(data.message);
      return;
    }
    if (!data.candidates?.length) {
      setError(data.message || READ_FAIL_MESSAGE);
    }
  }

  async function finishAfterIdentify(
    card: PokemonCard | null,
    extract: ExtractedCard,
    scan: number,
  ) {
    if (!scansRef.current.isCurrent(scan)) return;
    const label = recognizedLabel(extract, card);
    setProgress(label ? `Recognized: ${label} — looking up comparables…` : "Looking up comparables…");
    await loadSolds(card, extract, undefined, scan);
  }

  async function loadSolds(
    card: PokemonCard | null,
    extract: ExtractedCard,
    nameOverride: string | undefined,
    scan: number,
    ebayAppId = appId,
  ) {
    if (!scansRef.current.isCurrent(scan)) return;
    setPhase("working");
    const label = recognizedLabel(extract, card);
    setProgress(label ? `Recognized: ${label} — looking up comparables…` : "Looking up comparables…");
    const res = await fetch("/api/solds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(soldsRequestBody(card, extract, nameOverride, ebayAppId)),
    });
    const data = (await res.json()) as SoldsResponse & { error?: string };
    if (!scansRef.current.isCurrent(scan)) return;
    if (!res.ok) {
      throw new Error(data.error || "Could not load comparables.");
    }
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
    const scan = beginScan();
    try {
      setPreview(SAMPLE_CARD.image);
      setProgress("Matching sample card…");
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ text: SAMPLE_CARD.text }),
      });
      const data = (await res.json()) as IdentifyResponse & { error?: string };
      if (!scansRef.current.isCurrent(scan)) return;
      if (!res.ok) throw new Error(data.error || "Sample identify failed.");
      await applyIdentify(data, scan);
    } catch (err) {
      if (!scansRef.current.isCurrent(scan)) return;
      setPhase("idle");
      setProgress("");
      setError(err instanceof Error ? err.message : "Sample failed.");
    }
  }

  async function onManualSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!search.trim()) return;
    const scan = beginScan();
    try {
      setProgress("Searching cards…");
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ extracted: { name: search.trim() } }),
      });
      const data = (await res.json()) as IdentifyResponse & { error?: string };
      if (!scansRef.current.isCurrent(scan)) return;
      if (!res.ok) throw new Error(data.error || "Search failed.");
      await applyIdentify(data, scan);
    } catch (err) {
      if (!scansRef.current.isCurrent(scan)) return;
      setPhase("candidates");
      setProgress("");
      setError(err instanceof Error ? err.message : "Search failed.");
    }
  }

  function saveAppId(next: string) {
    writeEbayAppId(next);
    setAppId(next);
    setSetupError(null);
    setShowSetup(false);
    if (hasCardIdentity(extracted, selected)) {
      const scan = scansRef.current.begin();
      void loadSolds(selected, extracted, undefined, scan, next).catch((err) => {
        if (!scansRef.current.isCurrent(scan)) return;
        setError(err instanceof Error ? err.message : "Could not load comparables.");
      });
    }
  }

  function skipSetup() {
    markEbaySetupSeen();
    setSetupError(null);
    setShowSetup(false);
  }

  function clearAppId() {
    clearEbayAppId();
    setAppId("");
    setSetupError(null);
    if (hasCardIdentity(extracted, selected)) {
      const scan = scansRef.current.begin();
      void loadSolds(selected, extracted, undefined, scan, "").catch((err) => {
        if (!scansRef.current.isCurrent(scan)) return;
        setError(err instanceof Error ? err.message : "Could not load comparables.");
      });
    } else {
      setSolds(null);
    }
  }

  if (!ready) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-phone place-items-center px-4">
        <p className="text-sm text-paper-mute">Loading…</p>
      </main>
    );
  }

  if (showSetup) {
    return (
      <EbaySetup
        initialValue={appId}
        error={setupError}
        onSave={saveAppId}
        onSkip={skipSetup}
        onCancel={readEbaySetupSeen() || Boolean(appId) ? () => setShowSetup(false) : undefined}
      />
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-phone px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-bolt">the midnightman</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Card Scan</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setSetupError(null);
              setShowSetup(true);
            }}
            className="grid h-12 w-12 place-items-center rounded-2xl bg-ink-card text-lg ring-1 ring-ink-line"
            aria-label="eBay App ID settings"
          >
            ⚙
          </button>
        </div>
        <p className="mt-2 text-sm text-paper-mute">
          Photo a Pokémon card. We read the image, then show name, number, set, year, rarity, and market comps.
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
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void onFile(file);
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void onFile(file);
        }}
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

      {showIdentity ? (
        <CardIdentityPanel identity={identity} image={selected?.images.small} note={identityNote} />
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
                      const scan = scansRef.current.begin();
                      setSolds(null);
                      setSelected(card);
                      void finishAfterIdentify(card, extracted, scan).catch((err) => {
                        if (!scansRef.current.isCurrent(scan)) return;
                        setError(err instanceof Error ? err.message : "Comparables failed.");
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
                        {[
                          card.printedNumber,
                          card.setName,
                          card.setYear ?? null,
                          card.rarity || "Unknown",
                        ]
                          .filter((part) => part != null && part !== "")
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {solds && phase !== "working" ? (
        <CompsPanel
          solds={solds}
          preferRaw={preferRaw}
          hasAppId={Boolean(appId)}
          onAddAppId={() => {
            setSetupError(null);
            setShowSetup(true);
          }}
        />
      ) : null}

      <p className="mt-8 text-center text-xs text-paper-mute">
        <button type="button" onClick={() => setShowSetup(true)} className="underline-offset-4 hover:underline">
          Change eBay App ID
        </button>
        {" · "}
        <button type="button" onClick={clearAppId} className="underline-offset-4 hover:underline">
          Clear App ID
        </button>
      </p>
    </main>
  );
}
