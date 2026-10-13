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
