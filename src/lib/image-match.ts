import { artSignature, signatureDistance } from "./art-hash";
import { straightenCardPhoto } from "./card-photo";
import { readImageHash, writeImageHash } from "./image-hash-cache";
import { isCatalogImageUrl } from "./thumbnail";
import type { PokemonCard } from "../types/card";

export type ImageHashCache = {
  get(cardId: string, imageUrl: string): Promise<string | null>;
  set(cardId: string, imageUrl: string, hash: string): Promise<void>;
};

const postgresCache: ImageHashCache = {
  get: readImageHash,
  set: writeImageHash,
};

function catalogImageUrl(card: PokemonCard): string | null {
  const url = card.images?.small || card.images?.large;
  return url && isCatalogImageUrl(url) ? url : null;
}

async function fetchCatalogArt(url: string, fetchImpl: typeof fetch): Promise<Buffer | null> {
  if (!isCatalogImageUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return null;
    const mime = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (mime && !mime.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 32 || bytes.length > 2_000_000) return null;
    return bytes;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function usableSignature(value: string | null): value is string {
  return Boolean(value && signatureDistance(value, value) === 0);
}

async function hashForCard(
  card: PokemonCard,
  fetchImpl: typeof fetch,
  cache: ImageHashCache,
): Promise<string | null> {
  const url = catalogImageUrl(card);
  if (!url) return null;
  const cached = await cache.get(card.id, url);
  if (usableSignature(cached)) return cached;
  const bytes = await fetchCatalogArt(url, fetchImpl);
  if (!bytes) return null;
  try {
    const hash = await artSignature(bytes);
    await cache.set(card.id, url, hash);
    return hash;
  } catch {
    return null;
  }
}

/** Combined art-hash distance from the straightened photo to each catalog image. */
export async function catalogHashDistances(
  photo: Buffer,
  cards: PokemonCard[],
  deps: { fetchImpl?: typeof fetch; cache?: ImageHashCache; deadlineMs?: number } = {},
): Promise<Map<string, number>> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cache = deps.cache ?? postgresCache;
  const deadline = Date.now() + (deps.deadlineMs ?? 20_000);
  const prepared = await straightenCardPhoto(photo);
  const photoHash = await artSignature(prepared);
  const distances = new Map<string, number>();
  const queue = cards.filter((card) => catalogImageUrl(card));

  for (let i = 0; i < queue.length; i += 8) {
    if (Date.now() > deadline) break;
    const slice = queue.slice(i, i + 8);
    const hashed = await Promise.all(
      slice.map(async (card) => {
        const hash = await hashForCard(card, fetchImpl, cache);
        if (!hash) return null;
        const distance = signatureDistance(photoHash, hash);
        return distance == null ? null : ([card.id, distance] as const);
      }),
    );
    for (const row of hashed) {
      if (row) distances.set(row[0], row[1]);
    }
  }
  return distances;
}
