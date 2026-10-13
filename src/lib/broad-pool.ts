import { signatureDistance } from "./art-hash";
import { listImageHashes } from "./image-hash-cache";
import type { PokemonCard } from "../types/card";

/**
 * Cards a name search can miss. sv3-223 is Obsidian Flames (2023), outside a
 * two-year set window counted from 2026, so it has to be listed here.
 */
export const CHASE_CARD_IDS = [
  "sv3-223",
  "sv3-125",
  "base1-4",
  "swsh7-215",
  "swsh11-186",
  "swsh8-264",
  "sv4pt5-245",
  "sv8pt5-161",
  "me1-1",
  "xy12-11",
];

/** How many cached recent-set hashes are compared beyond the chase list. */
export const CACHED_BROAD_LIMIT = 40;

export function chaseCard(id: string, imageUrl?: string): PokemonCard {
  const cut = id.lastIndexOf("-");
  const setId = cut > 0 ? id.slice(0, cut) : id;
  const number = cut > 0 ? id.slice(cut + 1) : "";
  const url = imageUrl || `https://images.pokemontcg.io/${setId}/${number}.png`;
  return {
    id,
    name: id,
    setName: setId,
    setId,
    number,
    printedNumber: number,
    language: "English",
    images: { small: url },
    variantHints: [],
  };
}

function usableSignature(value: string): boolean {
  return signatureDistance(value, value) === 0;
}

/**
 * Precomputed signatures for the broad compare, plus chase cards that still
 * need a live hash. Cached rows already include their distance.
 */
export async function broadPoolCandidates(
  photoHash: string,
  exclude: Set<string>,
): Promise<{ cards: PokemonCard[]; distances: Map<string, number> }> {
  const cached = await listImageHashes();
  const cachedById = new Map(cached.map((row) => [row.cardId, row]));
  const distances = new Map<string, number>();
  const cards: PokemonCard[] = [];
  const seen = new Set<string>(exclude);

  const hits: Array<{ card: PokemonCard; distance: number }> = [];
  for (const row of cached) {
    if (seen.has(row.cardId) || !usableSignature(row.dhash)) continue;
    const distance = signatureDistance(photoHash, row.dhash);
    if (distance == null) continue;
    hits.push({ card: chaseCard(row.cardId, row.imageUrl), distance });
  }
  hits.sort((a, b) => a.distance - b.distance);
  for (const hit of hits.slice(0, CACHED_BROAD_LIMIT)) {
    seen.add(hit.card.id);
    cards.push(hit.card);
    distances.set(hit.card.id, hit.distance);
  }

  for (const id of CHASE_CARD_IDS) {
    if (seen.has(id)) continue;
    const row = cachedById.get(id);
    if (row && usableSignature(row.dhash)) {
      const distance = signatureDistance(photoHash, row.dhash);
      if (distance != null) {
        seen.add(id);
        cards.push(chaseCard(id, row.imageUrl));
        distances.set(id, distance);
        continue;
      }
    }
    seen.add(id);
    cards.push(chaseCard(id));
  }

  return { cards, distances };
}
