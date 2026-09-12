export const EBAY_APP_ID_STORAGE_KEY = "card-scan.ebayAppId";
export const EBAY_SETUP_SEEN_KEY = "card-scan.ebaySetupSeen";

export const EBAY_KEYS_URL = "https://developer.ebay.com/my/keys";

export function normalizeEbayAppId(value: string | undefined | null): string {
  return (value ?? "").trim();
}

export function isLikelyEbayAppId(value: string): boolean {
  const id = normalizeEbayAppId(value);
  return id.length >= 8 && id.length <= 160 && !/\s/.test(id);
}

export function readEbayAppId(): string {
  if (typeof window === "undefined") return "";
  try {
    return normalizeEbayAppId(window.localStorage.getItem(EBAY_APP_ID_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function writeEbayAppId(value: string): void {
  const id = normalizeEbayAppId(value);
  window.localStorage.setItem(EBAY_APP_ID_STORAGE_KEY, id);
  markEbaySetupSeen();
}

export function clearEbayAppId(): void {
  window.localStorage.removeItem(EBAY_APP_ID_STORAGE_KEY);
}

export function readEbaySetupSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(EBAY_SETUP_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markEbaySetupSeen(): void {
  window.localStorage.setItem(EBAY_SETUP_SEEN_KEY, "1");
}

/** First launch only: no saved App ID and they have not skipped yet. */
export function shouldShowEbaySetupOnLaunch(appId: string, setupSeen: boolean): boolean {
  return !normalizeEbayAppId(appId) && !setupSeen;
}
