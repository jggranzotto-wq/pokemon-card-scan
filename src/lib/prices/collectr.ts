import { isGradedCondition } from "../card-fields";
import { closedQuote, errorQuote, okQuote, type PriceInput, type PriceQuote } from "./types";

export const COLLECTR_REGISTER_URL = "https://getcollectr.com/api";

export const COLLECTR_NOT_CONNECTED =
  "Connect Collectr with an API key from getcollectr.com/api. There is no public Collectr price feed, and this app does not scrape Collectr.";

type Product = {
  id: string;
  name: string;
  setName: string;
  number: string;
  ungraded: number | null;
  graded: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function firstNumber(record: Record<string, unknown> | null, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const amount = asNumber(record[key]);
    if (amount != null) return amount;
  }
  const nested = asRecord(record.price) ?? asRecord(record.market);
  if (nested) {
    for (const key of keys) {
      const amount = asNumber(nested[key]);
      if (amount != null) return amount;
    }
  }
  return null;
}

const PRICE_KEYS = ["market_price", "marketPrice", "price", "market", "ungraded_price", "current_price"];

function productArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const record = asRecord(body);
  if (!record) return [];
  for (const key of ["products", "data", "results", "items"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

export function parseCollectrProducts(body: unknown): Product[] {
  const products: Product[] = [];
  for (const entry of productArray(body)) {
    const record = asRecord(entry);
    if (!record) continue;
    const id = String(record.id ?? record.product_id ?? record.productId ?? "").trim();
    const name = String(record.name ?? record.product_name ?? record.productName ?? "").trim();
    if (!id || !name) continue;
    const setName = String(record.set ?? record.set_name ?? record.setName ?? record.catalog_group ?? "").trim();
    const number = String(record.number ?? record.card_number ?? record.cardNumber ?? "").trim();
    const ungraded =
      firstNumber(record, PRICE_KEYS) ??
      firstNumber(asRecord(record.ungraded), PRICE_KEYS);
    const graded =
      firstNumber(asRecord(record.graded), PRICE_KEYS) ??
      firstNumber(asRecord(record.graded_price), PRICE_KEYS);
    products.push({ id, name, setName, number, ungraded, graded });
  }
  return products;
}

export function parseCollectrPrice(body: unknown): { ungraded: number | null; graded: number | null } {
  const record = asRecord(body);
  const data = asRecord(record?.data) ?? asRecord(record?.product) ?? record;
  return {
    ungraded: firstNumber(data, PRICE_KEYS) ?? firstNumber(asRecord(data?.ungraded), PRICE_KEYS),
    graded: firstNumber(asRecord(data?.graded), PRICE_KEYS) ?? firstNumber(asRecord(data?.graded_price), PRICE_KEYS),
  };
}

export function scoreCollectrProduct(
  product: Product,
  input: Pick<PriceInput, "name" | "setName" | "number" | "printedNumber">,
): number {
  let score = 0;
  const name = product.name.toLowerCase();
  const wanted = input.name.trim().toLowerCase();
  if (!wanted) return 0;
  if (name === wanted) score += 5;
  else if (name.includes(wanted)) score += 3;

  const wantedNumber = (input.printedNumber || input.number || "").trim().toLowerCase();
  const productNumber = product.number.toLowerCase();
  if (wantedNumber && productNumber) {
    const wantedBase = wantedNumber.split("/")[0].replace(/^0+/, "");
    const productBase = productNumber.split("/")[0].replace(/^0+/, "");
    if (productNumber === wantedNumber || (wantedBase && wantedBase === productBase)) score += 5;
  }

  const setName = (input.setName || "").trim().toLowerCase();
  if (setName && product.setName.toLowerCase().includes(setName.slice(0, Math.min(setName.length, 16)))) {
    score += 3;
  }
  return score;
}

export function chooseCollectrProduct(products: Product[], input: PriceInput): Product | null {
  const ranked = products
    .map((product) => ({ product, score: scoreCollectrProduct(product, input) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
  const hasNumber = Boolean((input.printedNumber || input.number || "").trim());
  if (hasNumber && best.score < 8) return null;
  if (!hasNumber && best.score < 6) return null;
  return best.product;
}

function collectrBase(env: NodeJS.ProcessEnv): string {
  return (env.COLLECTR_API_BASE || "https://api.getcollectr.com").replace(/\/$/, "");
}

function searchPath(env: NodeJS.ProcessEnv): string {
  return env.COLLECTR_SEARCH_PATH?.trim() || "/v1/catalog/search";
}

function productPath(env: NodeJS.ProcessEnv, id: string): string {
  const template = env.COLLECTR_PRODUCT_PATH?.trim() || "/v1/catalog/products/{id}";
  return template.replace("{id}", encodeURIComponent(id));
}

async function collectrGet(url: string, key: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "X-Api-Key": key,
    },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Collectr API ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Collectr API did not return JSON. Check COLLECTR_API_BASE against the docs they sent you.");
  }
}

export async function quoteCollectr(
  input: PriceInput,
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<PriceQuote> {
  const env = deps.env ?? process.env;
  const key = env.COLLECTR_API_KEY?.trim();
  if (!key) return closedQuote("collectr", "not_connected", "Not connected", COLLECTR_NOT_CONNECTED);

  const fetchImpl = deps.fetch ?? fetch;
  const graded = isGradedCondition(input.condition);
  try {
    let productId = input.collectrProductId?.trim() || "";
    let fromSearch: Product | null = null;
    if (!productId) {
      const params = new URLSearchParams({
        q: [input.name, input.printedNumber || input.number, input.setName, "pokemon"].filter(Boolean).join(" "),
        query: [input.name, input.printedNumber || input.number, input.setName].filter(Boolean).join(" "),
        game: "pokemon",
      });
      const body = await collectrGet(`${collectrBase(env)}${searchPath(env)}?${params.toString()}`, key, fetchImpl);
      fromSearch = chooseCollectrProduct(parseCollectrProducts(body), input);
      if (!fromSearch) {
        return closedQuote(
          "collectr",
          "unavailable",
          "No Collectr match",
          "Collectr's catalog search did not return a confident match for this name, number, and set.",
        );
      }
      productId = fromSearch.id;
    }

    const detail = await collectrGet(`${collectrBase(env)}${productPath(env, productId)}`, key, fetchImpl);
    const prices = parseCollectrPrice(detail);
    const amount = graded ? prices.graded ?? fromSearch?.graded : prices.ungraded ?? fromSearch?.ungraded;
    const usedGraded = graded && (prices.graded != null || fromSearch?.graded != null);
    if (amount == null) {
      const fallback = !graded ? null : prices.ungraded ?? fromSearch?.ungraded ?? null;
      if (fallback == null) {
        return closedQuote("collectr", "unavailable", "No Collectr price", "The matched Collectr product has no market price.", );
      }
      return okQuote(
        "collectr",
        fallback,
        graded ? "Collectr ungraded market (no graded price on this product)" : "Collectr market",
        "USD market price from the Collectr partner API.",
        productId,
      );
    }
    return okQuote(
      "collectr",
      amount,
      usedGraded ? `Collectr graded market · ${input.condition}` : "Collectr market",
      "USD market price from the Collectr partner API.",
      productId,
    );
  } catch (error) {
    return errorQuote("collectr", error);
  }
}
