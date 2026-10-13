"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EbaySetup } from "@/components/EbaySetup";
import { apiUrl } from "@/lib/api-origin";
import { apiFetch, readCollectionToken, writeCollectionToken } from "@/lib/client-api";
import { COLLECTR_REGISTER_URL, COLLECTR_TERMS_URL } from "@/lib/collectr-links";
import { clearEbayAppId, readEbayAppId, writeEbayAppId } from "@/lib/ebay-app-id";
import type { StatusResponse } from "@/types/card";
import { TopNav } from "./TopNav";

const EBAY_NOTES: Record<string, string> = {
  connected: "eBay seller account connected. Listings still wait for your confirmation.",
  "not-configured": "Add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RUNAME on the server first.",
  "no-database": "Connect Postgres before linking an eBay seller account.",
  "invalid-state": "The eBay login expired. Try connecting again.",
};

export function SettingsScreen() {
  const params = useSearchParams();
  const ebayNote = params.get("ebay");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [appId, setAppId] = useState("");
  const [showAppId, setShowAppId] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    setAppId(readEbayAppId());
    setPassword(readCollectionToken());
    void apiFetch("/api/status")
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-phone px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <TopNav active="settings" />
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-paper-mute">Keys stay in environment variables on the server, or in this phone for the eBay App ID and collection password.</p>

      {ebayNote ? (
        <p className="mt-4 rounded-2xl bg-ink-card px-4 py-3 text-sm ring-1 ring-ink-line">
          {EBAY_NOTES[ebayNote] || `eBay: ${ebayNote}`}
        </p>
      ) : null}

      <section className="mt-4 grid gap-2 rounded-3xl bg-ink-card p-4 text-sm ring-1 ring-ink-line">
        <h2 className="font-semibold">Connections</h2>
        <p>Database: {status?.database ? "connected" : "not connected"}</p>
        <p>Collectr: {status?.collectr === "connected" ? "API key set" : "Not connected"}</p>
        <p>
          eBay last sold:{" "}
          {status?.ebaySold === "insights"
            ? "Marketplace Insights credentials present (access still depends on eBay approval)"
            : status?.ebaySold === "finding"
              ? "Finding App ID present. Sold rows are legacy completed listings, not Marketplace Insights."
              : "Not connected"}
        </p>
        <p>eBay selling: {status?.ebaySell === "not_configured" ? "not configured" : status?.ebaySell}</p>
        <p>Seller OAuth: {status?.ebaySellerConnected ? "connected" : "not connected"}</p>
        <a href={apiUrl("/api/ebay/connect")} className="mt-2 grid min-h-12 place-items-center rounded-2xl bg-bolt font-semibold text-ink">
          Connect eBay seller
        </a>
      </section>

      <section className="mt-4 rounded-3xl bg-ink-card p-4 ring-1 ring-ink-line">
        <h2 className="font-semibold">Collectr</h2>
        <p className="mt-2 text-sm text-paper-mute">
          Register at the{" "}
          <a href={COLLECTR_REGISTER_URL} target="_blank" rel="noreferrer" className="text-sky underline">
            Collectr API portal
          </a>
          , then set COLLECTR_API_KEY and the COLLECTR_API_BASE from the docs they send. The{" "}
          <a href={COLLECTR_TERMS_URL} target="_blank" rel="noreferrer" className="text-sky underline">
            API terms
          </a>{" "}
          forbid scraping. Until then every Collectr price says Not connected.
        </p>
      </section>

      <section className="mt-4 rounded-3xl bg-ink-card p-4 ring-1 ring-ink-line">
        <h2 className="font-semibold">Collection password</h2>
        <p className="mt-2 text-sm text-paper-mute">Same value as COLLECTION_PASSWORD. Leave blank on localhost if the server has no password.</p>
        <input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            writeCollectionToken(event.target.value);
          }}
          className="mt-3 min-h-12 w-full rounded-2xl bg-ink px-3 ring-1 ring-ink-line"
        />
        <button
          type="button"
          onClick={() => writeCollectionToken(password)}
          className="mt-3 min-h-12 w-full rounded-2xl bg-ink-raised font-semibold ring-1 ring-ink-line"
        >
          Save password on this phone
        </button>
      </section>

      <section className="mt-4">
        <button type="button" onClick={() => setShowAppId((open) => !open)} className="text-sm font-semibold text-paper-mute underline-offset-4">
          {showAppId ? "Hide eBay App ID" : "eBay App ID for sold lookup"}
        </button>
        {showAppId ? (
          <div className="mt-3">
            <EbaySetup
              initialValue={appId}
              onSave={(value) => {
                writeEbayAppId(value);
                setAppId(value);
                setShowAppId(false);
              }}
              onSkip={() => setShowAppId(false)}
              onCancel={() => setShowAppId(false)}
            />
            <button type="button" onClick={() => { clearEbayAppId(); setAppId(""); }} className="mt-2 text-sm text-paper-mute">
              Clear App ID
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
