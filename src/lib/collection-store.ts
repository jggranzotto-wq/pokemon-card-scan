import { query, queryOne } from "./db";
import { collectionDay, previousDay } from "./day";
import { thumbnailQuery } from "./collection-auth";
import { changeSince, rollupSource, type SourceTotal } from "./prices/totals";
import { PRICE_SOURCES, type PriceQuote, type PriceSource, type QuoteStatus } from "./prices/types";
import { normalizeCondition, normalizeLanguage, normalizeVariant } from "./card-fields";

export type CardInput = {
  catalogId?: string | null;
  name: string;
  setName?: string | null;
  setId?: string | null;
  setYear?: number | null;
  collectorNumber?: string | null;
  printedNumber?: string | null;
  variant?: string | null;
  language?: string | null;
  rarity?: string | null;
  condition?: string | null;
  quantity?: number | null;
  purchasePrice?: number | null;
  purchaseCurrency?: string | null;
  imageUrl?: string | null;
};

export type StoredQuote = PriceQuote & { observedAt: string | null };

export type StoredCard = {
  id: string;
  catalogId: string | null;
  collectrProductId: string | null;
  name: string;
  setName: string | null;
  setId: string | null;
  setYear: number | null;
  collectorNumber: string | null;
  printedNumber: string | null;
  variant: string;
  language: string;
  rarity: string | null;
  condition: string;
  quantity: number;
  purchasePrice: number | null;
  purchaseCurrency: "CAD" | "USD" | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  prices: StoredQuote[];
  createdAt: string;
  updatedAt: string;
};

type CardRow = {
  id: string;
  catalog_id: string | null;
  collectr_product_id: string | null;
  name: string;
  set_name: string | null;
  set_id: string | null;
  set_year: number | null;
  collector_number: string | null;
  printed_number: string | null;
  variant: string;
  language: string;
  rarity: string | null;
  condition: string;
  quantity: number;
  purchase_price: string | null;
  purchase_currency: string | null;
  image_url: string | null;
  has_thumbnail: boolean;
  created_at: Date;
  updated_at: Date;
};

type QuoteRow = {
  card_id: string;
  source: PriceSource;
  amount_usd: string | null;
  status: QuoteStatus;
  label: string;
  detail: string | null;
  observed_at: Date;
};

const CARD_SELECT = `
  id, catalog_id, collectr_product_id, name, set_name, set_id, set_year,
  collector_number, printed_number, variant, language, rarity, condition, quantity,
  purchase_price, purchase_currency, image_url,
  (thumbnail IS NOT NULL) AS has_thumbnail,
  created_at, updated_at
`;

function money(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyQuotes(): StoredQuote[] {
  return PRICE_SOURCES.map((source) => ({
    source,
    status: "unavailable",
    amountUsd: null,
    label: "No price yet",
    detail: "Prices appear after the first refresh.",
    observedAt: null,
  }));
}

function toCard(row: CardRow, quotes: StoredQuote[]): StoredCard {
  const query = row.has_thumbnail ? thumbnailQuery(row.id) : "";
  const thumb = row.has_thumbnail
    ? `/api/collection/${row.id}/thumbnail${query ? `?${query}` : ""}`
    : row.image_url;
  const currency = row.purchase_currency === "USD" || row.purchase_currency === "CAD" ? row.purchase_currency : null;
  return {
    id: row.id,
    catalogId: row.catalog_id,
    collectrProductId: row.collectr_product_id,
    name: row.name,
    setName: row.set_name,
    setId: row.set_id,
    setYear: row.set_year,
    collectorNumber: row.collector_number,
    printedNumber: row.printed_number,
    variant: row.variant,
    language: row.language,
    rarity: row.rarity,
    condition: row.condition,
    quantity: row.quantity,
    purchasePrice: money(row.purchase_price),
    purchaseCurrency: currency,
    imageUrl: row.image_url,
    thumbnailUrl: thumb,
    prices: quotes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function groupQuotes(rows: QuoteRow[]): Map<string, StoredQuote[]> {
  const byCard = new Map<string, StoredQuote[]>();
  for (const row of rows) {
    const list = byCard.get(row.card_id) ?? emptyQuotes();
    const index = list.findIndex((quote) => quote.source === row.source);
    const quote: StoredQuote = {
      source: row.source,
      status: row.status,
      amountUsd: money(row.amount_usd),
      label: row.label,
      detail: row.detail,
      observedAt: row.observed_at.toISOString(),
    };
    if (index >= 0) list[index] = quote;
    byCard.set(row.card_id, list);
  }
  return byCard;
}

async function latestQuotes(cardIds: string[]): Promise<Map<string, StoredQuote[]>> {
  if (!cardIds.length) return new Map();
  const rows = await query<QuoteRow>(
    `SELECT DISTINCT ON (card_id, source)
       card_id, source, amount_usd, status, label, detail, observed_at
     FROM price_snapshots
     WHERE card_id = ANY($1::uuid[])
     ORDER BY card_id, source, day DESC, observed_at DESC`,
    [cardIds],
  );
  return groupQuotes(rows);
}

export function cleanCardInput(
  input: CardInput,
  options: { allowZero?: boolean } = {},
): CardInput & { name: string; quantity: number; variant: string; condition: string; language: string } {
  const name = input.name.trim();
  if (!name) throw new Error("Card name is required.");
  const quantity = Number.isFinite(input.quantity) ? Math.floor(Number(input.quantity)) : 1;
  const minimum = options.allowZero ? 0 : 1;
  if (quantity < minimum || quantity > 999) throw new Error(`Quantity must be between ${minimum} and 999.`);
  let purchasePrice: number | null = null;
  if (input.purchasePrice != null && input.purchasePrice !== ("" as unknown)) {
    const parsed = Number(input.purchasePrice);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) throw new Error("Purchase price is not a valid amount.");
    purchasePrice = Math.round(parsed * 100) / 100;
  }
  const currency = input.purchaseCurrency === "USD" ? "USD" : input.purchaseCurrency ? "CAD" : purchasePrice == null ? null : "CAD";
  const year = input.setYear == null ? null : Number(input.setYear);
  return {
    ...input,
    name,
    quantity,
    variant: normalizeVariant(input.variant),
    condition: normalizeCondition(input.condition),
    language: normalizeLanguage(input.language),
    purchasePrice,
    purchaseCurrency: currency,
    setYear: year != null && Number.isFinite(year) ? year : null,
    catalogId: input.catalogId?.trim() || null,
    setName: input.setName?.trim() || null,
    setId: input.setId?.trim() || null,
    collectorNumber: input.collectorNumber?.trim() || null,
    printedNumber: input.printedNumber?.trim() || null,
    rarity: input.rarity?.trim() || null,
    imageUrl: input.imageUrl?.trim() || null,
  };
}

export async function createCard(
  input: CardInput,
  thumbnail?: { bytes: Buffer; mime: string } | null,
): Promise<string> {
  const card = cleanCardInput(input);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO collection_cards (
      catalog_id, name, set_name, set_id, set_year, collector_number, printed_number,
      variant, language, rarity, condition, quantity, purchase_price, purchase_currency,
      image_url, thumbnail, thumbnail_mime
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    ) RETURNING id`,
    [
      card.catalogId,
      card.name,
      card.setName,
      card.setId,
      card.setYear,
      card.collectorNumber,
      card.printedNumber,
      card.variant,
      card.language,
      card.rarity,
      card.condition,
      card.quantity,
      card.purchasePrice,
      card.purchaseCurrency,
      card.imageUrl,
      thumbnail?.bytes ?? null,
      thumbnail?.mime ?? null,
    ],
  );
  if (!row) throw new Error("Could not save the card.");
  return row.id;
}

export async function updateCard(id: string, patch: Partial<CardInput>): Promise<boolean> {
  const existing = await queryOne<CardRow>(`SELECT ${CARD_SELECT} FROM collection_cards WHERE id = $1`, [id]);
  if (!existing) return false;
  const next = cleanCardInput({
    name: patch.name ?? existing.name,
    catalogId: patch.catalogId === undefined ? existing.catalog_id : patch.catalogId,
    setName: patch.setName === undefined ? existing.set_name : patch.setName,
    setId: patch.setId === undefined ? existing.set_id : patch.setId,
    setYear: patch.setYear === undefined ? existing.set_year : patch.setYear,
    collectorNumber: patch.collectorNumber === undefined ? existing.collector_number : patch.collectorNumber,
    printedNumber: patch.printedNumber === undefined ? existing.printed_number : patch.printedNumber,
    variant: patch.variant === undefined ? existing.variant : patch.variant,
    language: patch.language === undefined ? existing.language : patch.language,
    rarity: patch.rarity === undefined ? existing.rarity : patch.rarity,
    condition: patch.condition === undefined ? existing.condition : patch.condition,
    quantity: patch.quantity === undefined ? existing.quantity : patch.quantity,
    purchasePrice: patch.purchasePrice === undefined ? money(existing.purchase_price) : patch.purchasePrice,
    purchaseCurrency: patch.purchaseCurrency === undefined ? existing.purchase_currency : patch.purchaseCurrency,
    imageUrl: patch.imageUrl === undefined ? existing.image_url : patch.imageUrl,
  }, { allowZero: true });
  await query(
    `UPDATE collection_cards SET
      name = $2, variant = $3, language = $4, rarity = $5, condition = $6, quantity = $7,
      purchase_price = $8, purchase_currency = $9, updated_at = now()
     WHERE id = $1`,
    [id, next.name, next.variant, next.language, next.rarity, next.condition, next.quantity, next.purchasePrice, next.purchaseCurrency],
  );
  return true;
}

export async function deleteCard(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(`DELETE FROM collection_cards WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

export async function getCard(id: string): Promise<StoredCard | null> {
  const row = await queryOne<CardRow>(`SELECT ${CARD_SELECT} FROM collection_cards WHERE id = $1`, [id]);
  if (!row) return null;
  const quotes = await latestQuotes([id]);
  return toCard(row, quotes.get(id) ?? emptyQuotes());
}

export async function listCards(): Promise<StoredCard[]> {
  const rows = await query<CardRow>(`SELECT ${CARD_SELECT} FROM collection_cards ORDER BY created_at DESC`);
  const quotes = await latestQuotes(rows.map((row) => row.id));
  return rows.map((row) => toCard(row, quotes.get(row.id) ?? emptyQuotes()));
}

export async function getThumbnail(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const row = await queryOne<{ thumbnail: Buffer | null; thumbnail_mime: string | null }>(
    `SELECT thumbnail, thumbnail_mime FROM collection_cards WHERE id = $1`,
    [id],
  );
  if (!row?.thumbnail) return null;
  return { bytes: row.thumbnail, mime: row.thumbnail_mime || "image/jpeg" };
}

export async function saveQuotes(cardId: string, day: string, quotes: PriceQuote[]): Promise<void> {
  for (const quote of quotes) {
    if (quote.status === "error") {
      const existing = await queryOne<{ status: string }>(
        `SELECT status FROM price_snapshots WHERE card_id = $1 AND source = $2 AND day = $3`,
        [cardId, quote.source, day],
      );
      if (existing?.status === "ok") continue;
    }
    await query(
      `INSERT INTO price_snapshots (card_id, source, day, amount_usd, status, label, detail, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (card_id, source, day) DO UPDATE SET
         amount_usd = EXCLUDED.amount_usd,
         status = EXCLUDED.status,
         label = EXCLUDED.label,
         detail = EXCLUDED.detail,
         observed_at = now()`,
      [cardId, quote.source, day, quote.amountUsd, quote.status, quote.label, quote.detail],
    );
    if (quote.source === "collectr" && quote.externalId) {
      await query(`UPDATE collection_cards SET collectr_product_id = $2 WHERE id = $1 AND collectr_product_id IS NULL`, [
        cardId,
        quote.externalId,
      ]);
    }
  }
}

export async function priceHistory(cardId: string): Promise<Record<PriceSource, { day: string; amountUsd: number | null; status: QuoteStatus }[]>> {
  const rows = await query<{ source: PriceSource; day: string; amount_usd: string | null; status: QuoteStatus }>(
    `SELECT source, to_char(day, 'YYYY-MM-DD') AS day, amount_usd, status
     FROM price_snapshots WHERE card_id = $1 ORDER BY day ASC`,
    [cardId],
  );
  const history = {
    tcgplayer: [],
    collectr: [],
    ebay_sold: [],
  } as Record<PriceSource, { day: string; amountUsd: number | null; status: QuoteStatus }[]>;
  for (const row of rows) {
    history[row.source].push({
      day: row.day,
      amountUsd: money(row.amount_usd),
      status: row.status,
    });
  }
  return history;
}

export type TotalView = SourceTotal & {
  previousUsd: number | null;
  changeUsd: number | null;
  updatedAt: string | null;
};

export async function recomputeTotals(day = collectionDay()): Promise<TotalView[]> {
  const cards = await listCards();
  const totals = PRICE_SOURCES.map((source) =>
    rollupSource(
      source,
      cards.map((card) => {
        const quote = card.prices.find((item) => item.source === source);
        return {
          quantity: card.quantity,
          status: quote?.status ?? "unavailable",
          amountUsd: quote?.amountUsd ?? null,
        };
      }),
    ),
  );

  for (const total of totals) {
    await query(
      `INSERT INTO collection_totals (source, day, total_usd, status, priced_count, card_count, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (source, day) DO UPDATE SET
         total_usd = EXCLUDED.total_usd,
         status = EXCLUDED.status,
         priced_count = EXCLUDED.priced_count,
         card_count = EXCLUDED.card_count,
         observed_at = now()`,
      [total.source, day, total.totalUsd, total.status, total.pricedCount, total.cardCount],
    );
  }
  return totalsForDay(day);
}

export async function totalsForDay(day = collectionDay()): Promise<TotalView[]> {
  const prior = previousDay(day);
  const rows = await query<{
    source: PriceSource;
    day: string;
    total_usd: string | null;
    status: SourceTotal["status"];
    priced_count: number;
    card_count: number;
    observed_at: Date;
  }>(
    `SELECT source, to_char(day, 'YYYY-MM-DD') AS day, total_usd, status, priced_count, card_count, observed_at
     FROM collection_totals WHERE day = $1 OR day = $2`,
    [day, prior],
  );

  return PRICE_SOURCES.map((source) => {
    const today = rows.find((row) => row.source === source && row.day === day);
    const yesterday = rows.find((row) => row.source === source && row.day === prior);
    const totalUsd = today ? money(today.total_usd) : null;
    const previousUsd = yesterday ? money(yesterday.total_usd) : null;
    return {
      source,
      status: today?.status ?? "empty",
      totalUsd,
      pricedCount: today?.priced_count ?? 0,
      cardCount: today?.card_count ?? 0,
      label: source === "tcgplayer" ? "TCGPlayer market" : source === "collectr" ? "Collectr" : "eBay last sold",
      previousUsd,
      changeUsd: changeSince(totalUsd, previousUsd),
      updatedAt: today?.observed_at.toISOString() ?? null,
    };
  });
}

export async function rememberFx(day: string, rate: number, label: string): Promise<void> {
  await query(
    `INSERT INTO fx_rates (day, usd_cad, label) VALUES ($1, $2, $3)
     ON CONFLICT (day) DO UPDATE SET usd_cad = EXCLUDED.usd_cad, label = EXCLUDED.label`,
    [day, rate, label],
  );
}

export async function adjustQuantity(id: string, delta: number): Promise<void> {
  await query(`UPDATE collection_cards SET quantity = GREATEST(quantity + $2, 0), updated_at = now() WHERE id = $1`, [
    id,
    delta,
  ]);
}
