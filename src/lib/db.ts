import { Pool, type QueryResultRow } from "pg";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS collection_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id TEXT,
  name TEXT NOT NULL,
  set_name TEXT,
  set_id TEXT,
  set_year INT,
  collector_number TEXT,
  printed_number TEXT,
  variant TEXT NOT NULL DEFAULT 'unknown',
  language TEXT NOT NULL DEFAULT 'English',
  rarity TEXT,
  condition TEXT NOT NULL DEFAULT 'NM',
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  purchase_price NUMERIC,
  purchase_currency TEXT,
  image_url TEXT,
  thumbnail BYTEA,
  thumbnail_mime TEXT,
  collectr_product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  card_id UUID NOT NULL REFERENCES collection_cards(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  day DATE NOT NULL,
  amount_usd NUMERIC,
  status TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, source, day)
);

CREATE TABLE IF NOT EXISTS collection_totals (
  source TEXT NOT NULL,
  day DATE NOT NULL,
  total_usd NUMERIC,
  status TEXT NOT NULL,
  priced_count INT NOT NULL,
  card_count INT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, day)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  day DATE PRIMARY KEY,
  usd_cad NUMERIC NOT NULL,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ebay_tokens (
  environment TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ebay_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES collection_cards(id) ON DELETE SET NULL,
  environment TEXT NOT NULL,
  status TEXT NOT NULL,
  sku TEXT,
  offer_id TEXT,
  listing_id TEXT,
  title TEXT NOT NULL,
  price NUMERIC,
  currency TEXT,
  quantity INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_image_hashes (
  card_id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  dhash TEXT NOT NULL,
  details JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE catalog_image_hashes ADD COLUMN IF NOT EXISTS details JSONB;
`;

let pool: Pool | null = null;
let migrated: Promise<void> | null = null;

export function databaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url || null;
}

export function hasDatabase(): boolean {
  return Boolean(databaseUrl());
}

function sslFor(url: string): false | { rejectUnauthorized: false } | undefined {
  if (process.env.DATABASE_SSL === "0") return false;
  if (process.env.DATABASE_SSL === "1") return { rejectUnauthorized: false };
  if (/localhost|127\.0\.0\.1/.test(url)) return undefined;
  return { rejectUnauthorized: false };
}

export function getPool(): Pool {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!pool) pool = new Pool({ connectionString: url, max: 5, ssl: sslFor(url) });
  return pool;
}

export async function migrate(): Promise<void> {
  if (!databaseUrl()) return;
  if (!migrated) {
    migrated = (async () => {
      const client = await getPool().connect();
      try {
        await client.query(SCHEMA);
      } finally {
        client.release();
      }
    })().catch((error: unknown) => {
      migrated = null;
      throw error;
    });
  }
  await migrated;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await migrate();
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Test helper. Production code keeps the pool for the life of the process. */
export async function closePool(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
  migrated = null;
}
