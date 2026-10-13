/** Hosted Next.js origin for Capacitor builds. Empty means same-origin (the PWA). */
export function apiOrigin(): string {
  return (process.env.NEXT_PUBLIC_API_ORIGIN ?? "").replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = apiOrigin();
  return origin ? `${origin}${normalized}` : normalized;
}
