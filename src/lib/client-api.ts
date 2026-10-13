import { apiUrl } from "./api-origin";

export const COLLECTION_TOKEN_KEY = "card-scan.collectionToken";

let memoryToken = "";

function readStored(storage: Storage | undefined): string {
  if (!storage) return "";
  try {
    return storage.getItem(COLLECTION_TOKEN_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function writeStored(storage: Storage | undefined, token: string): void {
  if (!storage) return;
  try {
    storage.setItem(COLLECTION_TOKEN_KEY, token);
  } catch {
    // Ignore private-mode storage failures. The in-memory copy still covers this page.
  }
}

export function readCollectionToken(): string {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return "";
  const token = readStored(window.localStorage) || readStored(window.sessionStorage);
  if (token) memoryToken = token;
  return token;
}

export function writeCollectionToken(value: string): void {
  const token = value.trim();
  memoryToken = token;
  if (typeof window === "undefined") return;
  writeStored(window.localStorage, token);
  writeStored(window.sessionStorage, token);
}

export function withCollectionAuth(headers: HeadersInit | undefined, token: string): Headers {
  const next = new Headers(headers);
  if (token && !next.has("Authorization")) next.set("Authorization", `Bearer ${token}`);
  return next;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = withCollectionAuth(init.headers, readCollectionToken());
  return fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
}
