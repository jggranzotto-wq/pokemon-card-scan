import { apiUrl } from "./api-origin";

export const COLLECTION_TOKEN_KEY = "card-scan.collectionToken";

export function readCollectionToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(COLLECTION_TOKEN_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function writeCollectionToken(value: string): void {
  window.localStorage.setItem(COLLECTION_TOKEN_KEY, value.trim());
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readCollectionToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
}
