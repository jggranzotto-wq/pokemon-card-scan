import { collectionDay } from "../day";
import { query } from "../db";
import { rememberFx, recomputeTotals, saveQuotes } from "../collection-store";
import { usdCadRate } from "../fx";
import { warmImageHashes, type WarmImageHashResult } from "../warm-image-hashes";
import type { PriceInput, PriceQuote } from "./types";
import { quoteCollectr } from "./collectr";
import { quoteEbaySold } from "./ebay-sold";
import { quoteTcgplayer } from "./tcgplayer";

export type RefreshTarget = PriceInput & { id: string };

async function loadTargets(): Promise<RefreshTarget[]> {
  return query<{
    id: string;
    catalog_id: string | null;
    collectr_product_id: string | null;
    name: string;
    set_name: string | null;
    set_id: string | null;
    collector_number: string | null;
    printed_number: string | null;
    variant: string;
    language: string;
    condition: string;
  }>(
    `SELECT id, catalog_id, collectr_product_id, name, set_name, set_id, collector_number,
            printed_number, variant, language, condition
     FROM collection_cards
     ORDER BY created_at ASC`,
  ).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      catalogId: row.catalog_id,
      collectrProductId: row.collectr_product_id,
      name: row.name,
      setName: row.set_name,
      setId: row.set_id,
      number: row.collector_number,
      printedNumber: row.printed_number,
      variant: row.variant,
      language: row.language,
      condition: row.condition,
    })),
  );
}

export async function quotesForCard(input: PriceInput, ebayAppId?: string): Promise<PriceQuote[]> {
  const fx = await usdCadRate();
  const [tcgplayer, collectr, ebay] = await Promise.all([
    quoteTcgplayer(input),
    quoteCollectr(input),
    quoteEbaySold(input, { usdCadRate: fx.rate, ebayAppId }),
  ]);
  return [tcgplayer, collectr, ebay];
}

export async function refreshCard(id: string, ebayAppId?: string): Promise<PriceQuote[]> {
  const targets = await loadTargets();
  const target = targets.find((card) => card.id === id);
  if (!target) throw new Error("Card not found.");
  const quotes = await quotesForCard(target, ebayAppId);
  const day = collectionDay();
  await saveQuotes(id, day, quotes);
  const fx = await usdCadRate();
  await rememberFx(day, fx.rate, fx.label);
  await recomputeTotals(day);
  return quotes;
}

export async function refreshAllPrices(ebayAppId?: string): Promise<{
  cards: number;
  day: string;
  failures: string[];
  imageHashes?: WarmImageHashResult;
  imageHashError?: string;
}> {
  const targets = await loadTargets();
  const day = collectionDay();
  const failures: string[] = [];
  for (const target of targets) {
    try {
      const quotes = await quotesForCard(target, ebayAppId);
      await saveQuotes(target.id, day, quotes);
    } catch (error) {
      failures.push(`${target.name}: ${error instanceof Error ? error.message : "refresh failed"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const fx = await usdCadRate();
  await rememberFx(day, fx.rate, fx.label);
  await recomputeTotals(day);
  try {
    const imageHashes = await warmImageHashes();
    return { cards: targets.length, day, failures, imageHashes };
  } catch (error) {
    const imageHashError = error instanceof Error ? error.message : "image hash warm failed";
    console.error(`[refresh-prices] image hash warm failed (${imageHashError})`);
    return { cards: targets.length, day, failures, imageHashError };
  }
}
