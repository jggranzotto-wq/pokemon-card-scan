import type { IdentifyResponse, SoldsResponse } from "@/types/card";

export const SCAN_SESSION_KEY = "card-scan.identifyResult";
export const SCAN_STARTED_KEY = "card-scan.scanStartedAt";
export const SCAN_EVENT = "card-scan-result";

export type ScanPhase = "idle" | "working" | "candidates" | "solds";

/** Identify outcome stored so a remount can show it again. */
export type ScanSession = {
  scanId: number;
  phase: ScanPhase;
  identify: IdentifyResponse | null;
  solds: SoldsResponse | null;
  selectedId: string | null;
  error: string | null;
  notice: string | null;
  manual: boolean;
  startedAt: number | null;
};

let currentScan = 0;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function currentScanId(): number {
  return currentScan;
}

export function isPersistedScanCurrent(id: number): boolean {
  return id === currentScan;
}

export function readScanStartedAt(): number | null {
  const raw = store()?.getItem(SCAN_STARTED_KEY);
  const started = raw ? Number(raw) : NaN;
  return Number.isFinite(started) ? started : null;
}

/** Ignores an in-flight scan without deleting a result already on screen. */
export function advancePersistedScan(): number {
  currentScan += 1;
  return currentScan;
}

export function beginPersistedScan(): { id: number; startedAt: number } {
  currentScan += 1;
  const startedAt = Date.now();
  const memory = store();
  try {
    memory?.removeItem(SCAN_SESSION_KEY);
    memory?.setItem(SCAN_STARTED_KEY, String(startedAt));
  } catch {
    // Private mode can reject sessionStorage. The in-memory id still drops stale results.
  }
  return { id: currentScan, startedAt };
}

export function readScanSession(): ScanSession | null {
  const raw = store()?.getItem(SCAN_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ScanSession;
    if (!parsed || typeof parsed !== "object" || typeof parsed.scanId !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function publishScanSession(id: number, session: Omit<ScanSession, "scanId">): ScanSession | null {
  if (id !== currentScan) return null;
  const full: ScanSession = { ...session, scanId: id };
  try {
    store()?.setItem(SCAN_SESSION_KEY, JSON.stringify(full));
  } catch {
    // Keep going. The same-document event still updates a remounted scan page.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SCAN_EVENT, { detail: full }));
  }
  return full;
}

export function clearScanClock(): void {
  try {
    store()?.removeItem(SCAN_STARTED_KEY);
  } catch {
    // Ignore storage failures.
  }
}
