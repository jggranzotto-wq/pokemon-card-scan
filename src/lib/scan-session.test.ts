import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  beginPersistedScan,
  isPersistedScanCurrent,
  publishScanSession,
  readScanSession,
  SCAN_SESSION_KEY,
} from "./scan-session";

const memory = new Map<string, string>();

function installStorage() {
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: () => null,
    get length() {
      return memory.size;
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", { value: store, configurable: true });
}

afterEach(() => {
  memory.clear();
});

describe("scan session", () => {
  it("keeps the identify result for a remount and ignores a stale scan", () => {
    installStorage();
    const first = beginPersistedScan();
    const published = publishScanSession(first.id, {
      phase: "candidates",
      identify: {
        method: "vision",
        extracted: { name: "Charizard" },
        candidates: [],
        visionAvailable: true,
        message: "No matching card.",
      },
      solds: null,
      selectedId: null,
      error: "No matching card. Search by name, year, and set.",
      notice: null,
      manual: true,
      startedAt: null,
    });
    assert.equal(published?.error?.includes("No matching card"), true);
    const restored = readScanSession();
    assert.equal(restored?.identify?.extracted.name, "Charizard");
    assert.equal(restored?.manual, true);
    assert.equal(memory.has(SCAN_SESSION_KEY), true);

    const second = beginPersistedScan();
    assert.equal(isPersistedScanCurrent(first.id), false);
    assert.equal(readScanSession(), null);
    assert.equal(
      publishScanSession(first.id, {
        phase: "solds",
        identify: null,
        solds: null,
        selectedId: null,
        error: "stale",
        notice: null,
        manual: false,
        startedAt: null,
      }),
      null,
    );
    assert.equal(isPersistedScanCurrent(second.id), true);
  });
});
