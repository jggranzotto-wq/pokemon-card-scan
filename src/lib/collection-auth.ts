import { createHmac, timingSafeEqual } from "node:crypto";

export const COLLECTION_TOKEN_KEY = "card-scan.collectionToken";

export function collectionPassword(): string | null {
  const value = process.env.COLLECTION_PASSWORD?.trim();
  return value || null;
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export function passwordMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function collectionAuthorized(request: Request): boolean {
  const expected = collectionPassword();
  if (!expected) return true;
  return passwordMatches(bearerToken(request), expected);
}

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const provided = request.headers.get("x-cron-secret")?.trim() || bearerToken(request);
  return passwordMatches(provided, secret);
}

function thumbnailSecret(): string | null {
  return collectionPassword() || process.env.SESSION_SECRET?.trim() || null;
}

export function thumbnailQuery(id: string, now = Date.now()): string {
  const secret = thumbnailSecret();
  if (!secret) return "";
  const exp = now + 7 * 24 * 60 * 60 * 1000;
  const sig = createHmac("sha256", secret).update(`${id}.${exp}`).digest("hex");
  return `exp=${exp}&sig=${sig}`;
}

export function thumbnailAllowed(id: string, request: Request): boolean {
  if (collectionAuthorized(request)) return true;
  const secret = thumbnailSecret();
  if (!secret) return true;
  const url = new URL(request.url);
  const exp = url.searchParams.get("exp") || "";
  const sig = url.searchParams.get("sig") || "";
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = createHmac("sha256", secret).update(`${id}.${exp}`).digest("hex");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
