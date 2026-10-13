import { chaseCard, CHASE_CARD_IDS } from "./broad-pool";
import { storeCatalogHash } from "./image-match";
import { listCardsInSet, listReleasedSets } from "./pokemon-tcg";
import type { PokemonCard } from "../types/card";

/** Sets released on or after this many years ago are warmed into the hash cache. */
export const BROAD_POOL_YEARS = 2;

/** New signatures stored per run. Later runs continue past what is already cached. */
export const WARM_HASH_LIMIT = 400;

export type WarmImageHashResult = {
  hashed: number;
  skipped: number;
  failed: number;
  sets: number;
};

type ReleasedSet = { id: string; releaseDate?: string };

export function setsReleasedSince(sets: ReleasedSet[], since: Date): ReleasedSet[] {
  const cutoff = since.toISOString().slice(0, 10);
  return sets
    .filter((set) => (set.releaseDate ?? "") >= cutoff)
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
}

export function broadPoolSince(now: Date, years = BROAD_POOL_YEARS): Date {
  const since = new Date(now);
  since.setUTCFullYear(since.getUTCFullYear() - years);
  return since;
}

export async function warmImageHashes(
  deps: {
    now?: Date;
    years?: number;
    limit?: number;
    chaseCards?: PokemonCard[];
    listSets?: () => Promise<ReleasedSet[]>;
    listCards?: (setId: string, page: number) => Promise<PokemonCard[]>;
    hashCard?: (card: PokemonCard) => Promise<"hashed" | "skipped" | "failed">;
  } = {},
): Promise<WarmImageHashResult> {
  const limit = deps.limit ?? WARM_HASH_LIMIT;
  const since = broadPoolSince(deps.now ?? new Date(), deps.years ?? BROAD_POOL_YEARS);
  const listSets = deps.listSets ?? listReleasedSets;
  const listCards = deps.listCards ?? ((setId: string, page: number) => listCardsInSet(setId, page));
  const hashCard = deps.hashCard ?? ((card: PokemonCard) => storeCatalogHash(card));
  const chaseCards = deps.chaseCards ?? CHASE_CARD_IDS.map((id) => chaseCard(id));
  const result: WarmImageHashResult = { hashed: 0, skipped: 0, failed: 0, sets: 0 };
  const seen = new Set<string>();

  const stop = () => result.hashed >= limit;

  const take = async (card: PokemonCard) => {
    if (stop() || seen.has(card.id)) return;
    seen.add(card.id);
    try {
      const status = await hashCard(card);
      result[status] += 1;
    } catch (error) {
      result.failed += 1;
      const detail = error instanceof Error ? error.message : "hash failed";
      console.error(`[warm-image-hashes] ${card.id} failed (${detail})`);
    }
  };

  for (const card of chaseCards) {
    await take(card);
    if (stop()) return result;
  }

  const sets = setsReleasedSince(await listSets(), since);
  result.sets = sets.length;
  for (const set of sets) {
    for (let page = 1; page <= 12; page += 1) {
      let rows: PokemonCard[] = [];
      try {
        rows = await listCards(set.id, page);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "set list failed";
        console.error(`[warm-image-hashes] set ${set.id} page ${page} failed (${detail})`);
        break;
      }
      if (!rows.length) break;
      for (const card of rows) {
        await take(card);
        if (stop()) return result;
      }
      if (rows.length < 50) break;
    }
  }
  return result;
}
