import { hasDatabase, query, queryOne } from "./db";

const memory = new Map<string, string>();

function key(cardId: string, imageUrl: string): string {
  return `${cardId}\n${imageUrl}`;
}

export async function readImageHash(cardId: string, imageUrl: string): Promise<string | null> {
  const cached = memory.get(key(cardId, imageUrl));
  if (cached) return cached;
  if (!hasDatabase()) return null;
  try {
    const row = await queryOne<{ image_url: string; dhash: string }>(
      `SELECT image_url, dhash FROM catalog_image_hashes WHERE card_id = $1`,
      [cardId],
    );
    if (!row || row.image_url !== imageUrl) return null;
    memory.set(key(cardId, imageUrl), row.dhash);
    return row.dhash;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "cache read failed";
    console.error(`[identify] image hash cache read failed (${detail})`);
    return null;
  }
}

export type StoredImageHash = { cardId: string; imageUrl: string; dhash: string };

export async function listImageHashes(): Promise<StoredImageHash[]> {
  const byId = new Map<string, StoredImageHash>();
  if (hasDatabase()) {
    try {
      const rows = await query<{ card_id: string; image_url: string; dhash: string }>(
        `SELECT card_id, image_url, dhash FROM catalog_image_hashes`,
      );
      for (const row of rows) {
        byId.set(row.card_id, { cardId: row.card_id, imageUrl: row.image_url, dhash: row.dhash });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "cache list failed";
      console.error(`[identify] image hash cache list failed (${detail})`);
    }
  }
  for (const [storedKey, dhash] of memory) {
    const splitAt = storedKey.indexOf("\n");
    if (splitAt <= 0) continue;
    const cardId = storedKey.slice(0, splitAt);
    const imageUrl = storedKey.slice(splitAt + 1);
    byId.set(cardId, { cardId, imageUrl, dhash });
  }
  return [...byId.values()];
}

/** Test helper. The identify process keeps hashes for its lifetime. */
export function clearImageHashMemory(): void {
  memory.clear();
}

export async function writeImageHash(cardId: string, imageUrl: string, dhash: string): Promise<void> {
  memory.set(key(cardId, imageUrl), dhash);
  if (!hasDatabase()) return;
  try {
    await query(
      `INSERT INTO catalog_image_hashes (card_id, image_url, dhash, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (card_id) DO UPDATE
         SET image_url = EXCLUDED.image_url, dhash = EXCLUDED.dhash, updated_at = now()`,
      [cardId, imageUrl, dhash],
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "cache write failed";
    console.error(`[identify] image hash cache write failed (${detail})`);
  }
}
