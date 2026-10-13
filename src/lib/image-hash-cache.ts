import { hasDatabase, query, queryOne } from "./db";
import type { PokemonCard } from "../types/card";

type MemoryEntry = { imageUrl: string; dhash: string; details?: PokemonCard };

const memory = new Map<string, MemoryEntry>();

export type StoredImageHash = {
  cardId: string;
  imageUrl: string;
  dhash: string;
  details?: PokemonCard;
};

/** A catalog card with a real name, set, and collector number. */
export function hasCatalogDetails(card: PokemonCard): boolean {
  return Boolean(card.name && card.name !== card.id && card.setName && card.number);
}

export function cardSnapshot(card: PokemonCard): PokemonCard {
  const details = { ...card };
  delete details.imageScore;
  return details;
}

function parseDetails(value: unknown): PokemonCard | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as PokemonCard;
  if (typeof row.name !== "string" || typeof row.id !== "string") return undefined;
  return row;
}

export function cardFromStored(cardId: string, imageUrl: string, details?: PokemonCard | null): PokemonCard {
  const cut = cardId.lastIndexOf("-");
  const setId = cut > 0 ? cardId.slice(0, cut) : cardId;
  const number = cut > 0 ? cardId.slice(cut + 1) : "";
  const fallback: PokemonCard = {
    id: cardId,
    name: cardId,
    setName: setId,
    setId,
    number,
    printedNumber: number,
    language: "English",
    images: { small: imageUrl },
    variantHints: [],
  };
  if (!details || !hasCatalogDetails({ ...fallback, ...details, id: cardId })) return fallback;
  const images = details.images?.small || details.images?.large ? details.images : fallback.images;
  return { ...fallback, ...cardSnapshot(details), id: cardId, images };
}

export async function readImageHash(cardId: string, imageUrl: string): Promise<string | null> {
  const cached = memory.get(cardId);
  if (cached?.dhash && cached.imageUrl === imageUrl) return cached.dhash;
  if (!hasDatabase()) return null;
  try {
    const row = await queryOne<{ image_url: string; dhash: string; details?: unknown }>(
      `SELECT image_url, dhash, details FROM catalog_image_hashes WHERE card_id = $1`,
      [cardId],
    );
    if (!row || row.image_url !== imageUrl) return null;
    memory.set(cardId, {
      imageUrl: row.image_url,
      dhash: row.dhash,
      details: parseDetails(row.details) ?? cached?.details,
    });
    return row.dhash;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "cache read failed";
    console.error(`[identify] image hash cache read failed (${detail})`);
    return null;
  }
}

export async function listImageHashes(): Promise<StoredImageHash[]> {
  const byId = new Map<string, StoredImageHash>();
  if (hasDatabase()) {
    try {
      const rows = await query<{ card_id: string; image_url: string; dhash: string; details?: unknown }>(
        `SELECT card_id, image_url, dhash, details FROM catalog_image_hashes`,
      );
      for (const row of rows) {
        byId.set(row.card_id, {
          cardId: row.card_id,
          imageUrl: row.image_url,
          dhash: row.dhash,
          details: parseDetails(row.details),
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "cache list failed";
      console.error(`[identify] image hash cache list failed (${detail})`);
    }
  }
  for (const [cardId, entry] of memory) {
    if (!entry.dhash) continue;
    const prev = byId.get(cardId);
    byId.set(cardId, {
      cardId,
      imageUrl: entry.imageUrl || prev?.imageUrl || "",
      dhash: entry.dhash,
      details: entry.details ?? prev?.details,
    });
  }
  return [...byId.values()];
}

/** Test helper. The identify process keeps hashes for its lifetime. */
export function clearImageHashMemory(): void {
  memory.clear();
}

export async function writeImageHash(
  cardId: string,
  imageUrl: string,
  dhash: string,
  details?: PokemonCard,
): Promise<void> {
  const prev = memory.get(cardId);
  const snapshot = details && hasCatalogDetails(details) ? cardSnapshot(details) : prev?.details;
  memory.set(cardId, { imageUrl, dhash, details: snapshot });
  if (!hasDatabase()) return;
  try {
    await query(
      `INSERT INTO catalog_image_hashes (card_id, image_url, dhash, details, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (card_id) DO UPDATE
         SET image_url = EXCLUDED.image_url,
             dhash = EXCLUDED.dhash,
             details = COALESCE(EXCLUDED.details, catalog_image_hashes.details),
             updated_at = now()`,
      [cardId, imageUrl, dhash, snapshot ? JSON.stringify(snapshot) : null],
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "cache write failed";
    console.error(`[identify] image hash cache write failed (${detail})`);
  }
}

/** Saves name, set, number, rarity, images, and prices onto an existing hash row. */
export async function writeCardDetails(card: PokemonCard): Promise<void> {
  if (!hasCatalogDetails(card)) return;
  const snapshot = cardSnapshot(card);
  const prev = memory.get(card.id);
  if (prev) memory.set(card.id, { ...prev, details: snapshot });
  if (!hasDatabase()) return;
  try {
    await query(
      `UPDATE catalog_image_hashes
       SET details = $2::jsonb, updated_at = now()
       WHERE card_id = $1`,
      [card.id, JSON.stringify(snapshot)],
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "cache detail write failed";
    console.error(`[identify] image hash detail write failed (${detail})`);
  }
}
