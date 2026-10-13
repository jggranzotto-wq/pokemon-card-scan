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
import { ManualIdentify } from "@/components/ManualIdentify";
import { SaveCardForm } from "@/components/SaveCardForm";
import { TopNav } from "@/components/TopNav";
import { apiUrl } from "@/lib/api-origin";
import { parseCollectorInput } from "@/lib/catalog";
import { isPlausibleCardName, parseOcrText, READ_FAIL_MESSAGE } from "@/lib/ocr-parse";
import { isVisionFallbackMessage } from "@/lib/vision-messages";
import { cardIdentity, hasCardIdentity, recognizedLabel } from "@/lib/recognized";
import {
  advancePersistedScan,
  beginPersistedScan,
  clearScanClock,
  currentScanId,
  isPersistedScanCurrent,
  publishScanSession,
  readScanSession,
  readScanStartedAt,
  SCAN_EVENT,
  type ScanSession,
} from "@/lib/scan-session";
import { soldsRequestBody } from "@/lib/solds-request";
import type {
  ExtractedCard,
  IdentifyResponse,
  PokemonCard,
  SoldsResponse,
  StatusResponse,
} from "@/types/card";

type Phase = "idle" | "working" | "candidates" | "solds";

const NETWORK_ERROR = "The photo didn't reach the server. Check your connection, or search by name.";

function failureMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  if (err.name === "TypeError" || /failed to fetch|networkerror|load failed/i.test(err.message)) return NETWORK_ERROR;
  return err.message || fallback;
}

export function HomeApp() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedCard>({});
  const [candidates, setCandidates] = useState<PokemonCard[]>([]);
  const [selected, setSelected] = useState<PokemonCard | null>(null);
  const [solds, setSolds] = useState<SoldsResponse | null>(null);
  const [ready, setReady] = useState(false);
  const [appId, setAppId] = useState("");
  const [showSetup, setShowSetup] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [manualToken, setManualToken] = useState(0);

  function applySession(session: ScanSession) {
    const identify = session.identify;
    const extract = identify?.extracted ?? {};
    const nextCandidates = identify?.candidates ?? [];
    setPhase(session.phase === "idle" ? "candidates" : session.phase);
    setError(session.error);
    setNotice(session.notice);
    setExtracted(extract);
    setCandidates(nextCandidates);
    setSelected(nextCandidates.find((card) => card.id === session.selectedId) ?? null);
    setSolds(session.solds);
    setStartedAt(session.phase === "working" ? session.startedAt : null);
    setProgress(session.phase === "working" ? "Identifying the card…" : "");
    if (session.manual) setManualToken(session.scanId || 1);
  }

  const applySessionRef = useRef(applySession);
  applySessionRef.current = applySession;

  useEffect(() => {
    const savedApp = readEbayAppId();
    setAppId(savedApp);
    setShowSetup(shouldShowEbaySetupOnLaunch(savedApp, readEbaySetupSeen()));
    const onResult = (event: Event) => {
      const session = (event as CustomEvent<ScanSession>).detail;
      if (session) applySessionRef.current(session);
    };
    window.addEventListener(SCAN_EVENT, onResult);
    const savedScan = readScanSession();
    if (savedScan?.phase === "working" && currentScanId() === 0) {
      applySessionRef.current({
        ...savedScan,
        phase: "candidates",
        error:
          savedScan.error ||
          "The scan was interrupted before the result could be shown. Search by name, or take the photo again.",
        manual: true,
        startedAt: null,
      });
    } else if (savedScan) {
      applySessionRef.current(savedScan);
    } else {
      setStartedAt(readScanStartedAt());
    }
    setReady(true);
    void fetch(apiUrl("/api/status"))
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus(null));
    void preloadOcr();
    return () => window.removeEventListener(SCAN_EVENT, onResult);
  }, []);

  useEffect(() => {
    if (phase !== "working" || startedAt == null) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);

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
    const next = beginPersistedScan();
    setError(null);
    setNotice(null);
    setSolds(null);
    setSelected(null);
    setCandidates([]);
    setExtracted({});
    setPhase("working");
    setStartedAt(next.startedAt);
    setElapsed(0);
    setProgress("Identifying the card…");
    publishScanSession(next.id, {
      phase: "working",
      identify: null,
      solds: null,
      selectedId: null,
      error: null,
      notice: null,
      manual: false,
      startedAt: next.startedAt,
    });
    return next.id;
  }

  function showFailure(
    scan: number,
    message: string,
    identify: IdentifyResponse | null = null,
    notice: string | null = null,
  ) {
    if (!isPersistedScanCurrent(scan)) return;
    clearScanClock();
    const session: ScanSession = {
      scanId: scan,
      phase: "candidates",
      identify,
      solds: null,
      selectedId: null,
      error: message,
      notice,
      manual: true,
      startedAt: null,
    };
    publishScanSession(scan, session);
    applySession(session);
  }

  async function readJson<T>(res: Response, emptyFallback: string): Promise<T & { error?: string }> {
    let text = "";
    try {
      text = await res.text();
    } catch (err) {
      throw new Error(failureMessage(err, emptyFallback));
    }
    if (!text.trim()) {
      throw new Error(res.ok ? "The server sent an empty response. Search by name instead." : `${emptyFallback} (${res.status}).`);
    }
    try {
      return JSON.parse(text) as T & { error?: string };
    } catch {
      throw new Error("The server sent an unreadable response. Search by name instead.");
    }
  }

  async function identifyBlob(blob: Blob, previewUrl: string) {
    const scan = beginScan();
    try {
      setProgress("Sending photo…");
      setPreview(previewUrl);

      const form = new FormData();
      form.append("image", blob, "card.jpg");
      const res = await fetch(apiUrl("/api/identify"), { method: "POST", body: form, cache: "no-store" });
      const data = await readJson<IdentifyResponse>(res, "Could not identify that card. Search by name instead.");
      if (!isPersistedScanCurrent(scan)) return;
      if (!res.ok && data.message !== "ocr-required") {
        throw new Error(data.error || data.message || "Could not identify that card. Search by name instead.");
      }

      if (data.message === "ocr-required") {
        setProgress("Reading the card on this phone…");
        const readWithTimeout = (lang: "eng" | "jpn") =>
          Promise.race([
            readCardText(
              blob,
              (statusText) => {
                if (isPersistedScanCurrent(scan)) setProgress(statusText);
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
        if (!isPersistedScanCurrent(scan)) return;
        setProgress("Matching the card…");
        const ocrRes = await fetch(apiUrl("/api/identify"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ text }),
        });
        const ocrData = await readJson<IdentifyResponse>(ocrRes, READ_FAIL_MESSAGE);
        if (!isPersistedScanCurrent(scan)) return;
        if (!ocrRes.ok) throw new Error(ocrData.error || READ_FAIL_MESSAGE);
        await applyIdentify(ocrData, scan);
        return;
      }

      await applyIdentify(data, scan);
    } catch (err) {
      showFailure(scan, failureMessage(err, "Could not identify that card. Search by name instead."));
    }
  }

  function commitSession(scan: number, session: Omit<ScanSession, "scanId">) {
    if (!isPersistedScanCurrent(scan)) return;
    publishScanSession(scan, session);
    applySession({ ...session, scanId: scan });
  }

  async function applyIdentify(data: IdentifyResponse, scan: number) {
    if (!isPersistedScanCurrent(scan)) return;
    const extract = {
      ...(data.extracted ?? {}),
      name: isPlausibleCardName(data.extracted?.name) ? data.extracted?.name : undefined,
    };
    const normalized: IdentifyResponse = {
      ...data,
      extracted: extract,
      candidates: data.candidates ?? [],
    };
    const auto = normalized.candidates.find((card) => card.id === data.autoSelectedId) ?? null;
    const fallbackNote = data.notice || (data.message && isVisionFallbackMessage(data.message) ? data.message : null);
    const noCandidates = normalized.candidates.length === 0;

    if (!auto && noCandidates) {
      showFailure(scan, data.message || READ_FAIL_MESSAGE, normalized, data.notice ?? fallbackNote);
      return;
    }

    if (auto) {
      try {
        setSelected(auto);
        setExtracted(extract);
        setCandidates(normalized.candidates);
        const sold = await loadSolds(auto, extract, undefined, scan);
        if (!sold || !isPersistedScanCurrent(scan)) return;
        clearScanClock();
        commitSession(scan, {
          phase: "solds",
          identify: normalized,
          solds: sold,
          selectedId: auto.id,
          error: null,
          notice: data.notice ?? fallbackNote,
          manual: false,
          startedAt: null,
        });
      } catch (err) {
        showFailure(scan, failureMessage(err, "Could not load comparables."), normalized);
      }
      return;
    }

    clearScanClock();
    commitSession(scan, {
      phase: "candidates",
      identify: normalized,
      solds: null,
      selectedId: null,
      error: null,
      notice: data.notice ?? fallbackNote,
      manual: false,
      startedAt: null,
    });
  }

  async function loadSolds(
    card: PokemonCard | null,
    extract: ExtractedCard,
    nameOverride: string | undefined,
    scan: number,
    ebayAppId = appId,
  ): Promise<SoldsResponse | null> {
    if (!isPersistedScanCurrent(scan)) return null;
    setPhase("working");
    const label = recognizedLabel(extract, card);
    setProgress(label ? `Recognized: ${label} — looking up comparables…` : "Looking up comparables…");
    let res: Response;
    try {
      res = await fetch(apiUrl("/api/solds"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(soldsRequestBody(card, extract, nameOverride, ebayAppId)),
      });
    } catch (err) {
      throw new Error(failureMessage(err, "Could not load comparables."));
    }
    const data = await readJson<SoldsResponse>(res, "Could not load comparables.");
    if (!isPersistedScanCurrent(scan)) return null;
    if (!res.ok) {
      throw new Error(data.error || "Could not load comparables.");
    }
    return data;
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const blob = await compressImage(file);
      setPhoto(blob);
      const url = URL.createObjectURL(blob);
      await identifyBlob(blob, url);
    } catch (err) {
      setPhase("candidates");
      setProgress("");
      setStartedAt(null);
      setError(failureMessage(err, "Could not read that photo. Search by name instead."));
      setManualToken((token) => token + 1);
    }
  }

  async function onSample() {
    const scan = beginScan();
    try {
      setPhoto(null);
      setPreview(SAMPLE_CARD.image);
      setProgress("Matching sample card…");
      const res = await fetch(apiUrl("/api/identify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ text: SAMPLE_CARD.text }),
      });
      const data = await readJson<IdentifyResponse>(res, "Sample identify failed. Search by name instead.");
      if (!isPersistedScanCurrent(scan)) return;
      if (!res.ok) throw new Error(data.error || "Sample identify failed. Search by name instead.");
      await applyIdentify(data, scan);
    } catch (err) {
      showFailure(scan, failureMessage(err, "Sample identify failed. Search by name instead."));
    }
  }

  async function onManualSearch(input: {
    name: string;
    year?: number;
    setName?: string;
    setId?: string;
    number?: string;
  }) {
    const parsed = parseCollectorInput(input.number);
    const scan = beginScan();
    try {
      setPhoto(null);
      setPreview(null);
      setProgress("Searching the catalog…");
      const res = await fetch(apiUrl("/api/identify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          extracted: {
            name: input.name.trim(),
            set: input.setName,
            setId: input.setId,
            setYear: input.year,
            collectorNumber: parsed.collectorNumber,
            printedTotal: parsed.printedTotal,
            confidence: 0.95,
          },
        }),
      });
      const data = await readJson<IdentifyResponse>(res, "Search failed.");
      if (!isPersistedScanCurrent(scan)) return;
      if (!res.ok) throw new Error(data.error || "Search failed.");
      await applyIdentify(data, scan);
    } catch (err) {
      showFailure(scan, failureMessage(err, "Search failed."));
    }
  }

  function currentIdentify(): IdentifyResponse {
    return {
      method: "text",
      extracted,
      candidates,
      autoSelectedId: selected?.id,
      visionAvailable: Boolean(status?.vision),
    };
  }

  function saveAppId(next: string) {
    writeEbayAppId(next);
    setAppId(next);
    setSetupError(null);
    setShowSetup(false);
    if (hasCardIdentity(extracted, selected)) {
      const scan = advancePersistedScan();
      const started = Date.now();
      setStartedAt(started);
      void loadSolds(selected, extracted, undefined, scan, next)
        .then((sold) => {
          if (!sold) return;
          clearScanClock();
          commitSession(scan, {
            phase: "solds",
            identify: currentIdentify(),
            solds: sold,
            selectedId: selected?.id ?? null,
            error: null,
            notice,
            manual: false,
            startedAt: null,
          });
        })
        .catch((err) => {
          if (!isPersistedScanCurrent(scan)) return;
          setPhase(solds ? "solds" : "candidates");
          setStartedAt(null);
          setProgress("");
          setError(failureMessage(err, "Could not load comparables."));
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
      const scan = advancePersistedScan();
      setStartedAt(Date.now());
      void loadSolds(selected, extracted, undefined, scan, "")
        .then((sold) => {
          if (!sold) return;
          clearScanClock();
          commitSession(scan, {
            phase: "solds",
            identify: currentIdentify(),
            solds: sold,
            selectedId: selected?.id ?? null,
            error: null,
            notice,
            manual: false,
            startedAt: null,
          });
        })
        .catch((err) => {
          if (!isPersistedScanCurrent(scan)) return;
          setPhase(solds ? "solds" : "candidates");
          setStartedAt(null);
          setProgress("");
          setError(failureMessage(err, "Could not load comparables."));
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
      <TopNav active="scan" />
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
          Photo a Pokémon card, or type the name and pick the year and set. Then we show name, number, set, year, rarity, and market comps.
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

      <ManualIdentify
        busy={phase === "working"}
        openToken={manualToken}
        onSearch={(input) => void onManualSearch(input)}
      />

      {phase === "working" ? (
        <p
          className="mt-4 rounded-2xl bg-bolt/15 px-4 py-3 text-sm font-semibold text-bolt"
          role="status"
          aria-live="polite"
        >
          {progress || "Identifying the card…"} <span className="tabular-nums">{elapsed}s</span>
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-2xl bg-ink-card px-4 py-3 text-sm text-paper" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl bg-coral/15 px-4 py-3 text-sm text-coral">{error}</p>
      ) : null}

      {showIdentity ? (
        <CardIdentityPanel identity={identity} image={selected?.images?.small} note={identityNote} />
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
                      const scan = advancePersistedScan();
                      setStartedAt(Date.now());
                      setSolds(null);
                      setSelected(card);
                      setPhase("working");
                      void loadSolds(card, extracted, undefined, scan)
                        .then((sold) => {
                          if (!sold) return;
                          clearScanClock();
                          commitSession(scan, {
                            phase: "solds",
                            identify: { ...currentIdentify(), autoSelectedId: card.id },
                            solds: sold,
                            selectedId: card.id,
                            error: null,
                            notice,
                            manual: false,
                            startedAt: null,
                          });
                        })
                        .catch((err) => {
                          if (!isPersistedScanCurrent(scan)) return;
                          setPhase("candidates");
                          setStartedAt(null);
                          setProgress("");
                          setError(failureMessage(err, "Comparables failed."));
                        });
                    }}
                    className={`flex w-full min-h-20 items-center gap-3 rounded-2xl px-3 py-2 text-left ring-1 ${
                      active ? "bg-sky/20 ring-sky" : "bg-ink-card ring-ink-line"
                    }`}
                  >
                    {card.images?.small ? (
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

      {showIdentity && phase !== "working" && identity.name !== "Unknown" ? (
        <SaveCardForm
          catalogId={selected?.id}
          name={selected?.name || extracted.name || identity.name}
          setName={selected?.setName || extracted.set}
          setId={selected?.setId || extracted.setId}
          setYear={selected?.setYear ?? extracted.setYear ?? extracted.copyrightYear}
          collectorNumber={selected?.number || extracted.collectorNumber}
          printedNumber={selected?.printedNumber}
          rarity={selected?.rarity}
          variant={extracted.variant}
          language={extracted.language || selected?.language}
          condition={extracted.grade || undefined}
          imageUrl={selected?.images?.large || selected?.images?.small}
          photo={photo}
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
