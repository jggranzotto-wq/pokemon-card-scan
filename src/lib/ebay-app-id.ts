export const EBAY_APP_ID_STORAGE_KEY = "card-scan.ebayAppId";

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
}

export function clearEbayAppId(): void {
  window.localStorage.removeItem(EBAY_APP_ID_STORAGE_KEY);
}
