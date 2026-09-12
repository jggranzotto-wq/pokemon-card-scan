"use client";

import { useState } from "react";
import { EBAY_KEYS_URL, isLikelyEbayAppId, normalizeEbayAppId } from "@/lib/ebay-app-id";

type Props = {
  initialValue?: string;
  error?: string | null;
  onSave: (appId: string) => void;
  onCancel?: () => void;
};

export function EbaySetup({ initialValue = "", error, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const appId = normalizeEbayAppId(value);
    if (!isLikelyEbayAppId(appId)) {
      setLocalError("Paste the App ID / Client ID only — no spaces.");
      return;
    }
    setLocalError(null);
    onSave(appId);
  }

  return (
    <main className="mx-auto min-h-dvh max-w-phone px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <p className="text-xs uppercase tracking-[0.2em] text-bolt">the midnightman</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">eBay App ID</h1>
      <p className="mt-2 text-sm text-paper-mute">
        Card Scan uses your eBay Developer App ID (also called Client ID) to look up recent{" "}
        <strong className="font-medium text-paper">sold</strong> prices. This is not your seller login.
      </p>

      <form onSubmit={handleSave} className="mt-6 grid gap-3">
        <label className="text-sm font-semibold" htmlFor="ebay-app-id">
          App ID / Client ID
        </label>
        <input
          id="ebay-app-id"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Your-App-PRD-…"
          className="min-h-14 rounded-2xl bg-ink-card px-4 text-base ring-1 ring-ink-line outline-none placeholder:text-paper-mute"
        />
        <button
          type="submit"
          className="min-h-14 rounded-2xl bg-bolt px-4 text-lg font-semibold text-ink active:scale-[0.99]"
        >
          Save
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 text-sm font-medium text-paper-mute underline-offset-4 hover:underline"
          >
            Back to scan
          </button>
        ) : null}
      </form>

      {localError || error ? (
        <p className="mt-4 rounded-2xl bg-coral/15 px-4 py-3 text-sm text-coral">{localError || error}</p>
      ) : null}

      <section className="mt-8 rounded-3xl bg-ink-card p-4 text-sm leading-relaxed text-paper-mute ring-1 ring-ink-line">
        <h2 className="font-semibold text-paper">Where to get it</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Open{" "}
            <a href="https://developer.ebay.com/" className="text-sky underline" target="_blank" rel="noreferrer">
              developer.ebay.com
            </a>{" "}
            and sign in.
          </li>
          <li>
            Go to{" "}
            <a href={EBAY_KEYS_URL} className="text-sky underline" target="_blank" rel="noreferrer">
              Application Keys
            </a>
            .
          </li>
          <li>Copy the Production <strong className="font-medium text-paper">App ID (Client ID)</strong>.</li>
        </ol>
        <p className="mt-3">Saved only on this phone. You can change or clear it later from settings.</p>
      </section>
    </main>
  );
}
