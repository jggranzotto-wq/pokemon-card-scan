import { detectGrade } from "../grades";
import { quantile } from "../money";
import { soldsQuery } from "../solds-summary";
import { EbayAppIdError, fetchEbaySolds } from "../ebay";
import { isGradedCondition } from "../card-fields";
import type { SoldListing } from "../../types/card";
import { closedQuote, errorQuote, okQuote, type PriceInput, type PriceQuote } from "./types";

export const EBAY_SOLD_NOT_CONNECTED =
  "Not connected. Recent sold prices come from eBay's Marketplace Insights API, which is limited to developers eBay approves for the buy.marketplace.insights scope. The Browse API only returns active listings, so it is not used as a sold price. A legacy Finding API App ID can still supply completed listings marked sold when eBay accepts that key.";

const INSIGHTS_SCOPE = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights";

type InsightSale = {
  title: string;
  amount: number;
  currency: string;
  soldAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseInsightSales(body: unknown): InsightSale[] {
  const record = asRecord(body);
  const rows = record?.itemSales;
  if (!Array.isArray(rows)) return [];
  const sales: InsightSale[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) continue;
    const price = asRecord(item.lastSoldPrice);
    const amount = Number(price?.value);
    const currency = String(price?.currency || "USD");
    const title = String(item.title || "");
    const soldAt = String(item.lastSoldDate || "");
    if (!title || !Number.isFinite(amount) || amount <= 0) continue;
    sales.push({ title, amount, currency, soldAt });
  }
  return sales;
}

export function selectLastSold(
  sales: Array<Pick<SoldListing, "title" | "priceUsd" | "soldAt" | "isGraded" | "grade">>,
  input: Pick<PriceInput, "name" | "condition">,
): { priceUsd: number; soldAt: string; median: number; count: number } | null {
  const wanted = input.name.trim().toLowerCase();
  if (wanted.length < 2) return null;
  let matched = sales.filter((sale) => sale.title.toLowerCase().includes(wanted) && sale.priceUsd > 0);
  if (!matched.length) return null;

  if (isGradedCondition(input.condition)) {
    const grade = (input.condition || "").toUpperCase();
    const exact = matched.filter(
      (sale) => sale.title.toUpperCase().includes(grade) || sale.grade.toUpperCase() === grade,
    );
    if (exact.length) matched = exact;
    else {
      const graded = matched.filter((sale) => sale.isGraded);
      if (graded.length) matched = graded;
    }
  } else {
    const raw = matched.filter((sale) => !sale.isGraded);
    if (raw.length) matched = raw;
  }

  matched.sort((a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt));
  const prices = matched.map((sale) => sale.priceUsd).sort((a, b) => a - b);
  const last = matched[0];
  if (!last || !prices.length) return null;
  return {
    priceUsd: last.priceUsd,
    soldAt: last.soldAt,
    median: quantile(prices, 0.5),
    count: prices.length,
  };
}

function toSold(sales: InsightSale[], usdCadRate: number): SoldListing[] {
  return sales.map((sale) => {
    const usd = sale.currency.toUpperCase() === "CAD" ? sale.amount / usdCadRate : sale.amount;
    const grade = detectGrade(sale.title);
    return {
      id: sale.title,
      title: sale.title,
      priceUsd: usd,
      soldAt: sale.soldAt || new Date(0).toISOString(),
      grade: grade.grade,
      isGraded: grade.isGraded,
    };
  });
}

function quoteFromSales(
  sales: SoldListing[],
  input: PriceInput,
  label: string,
  detailPrefix: string,
): PriceQuote {
  const picked = selectLastSold(sales, input);
  if (!picked) {
    return closedQuote(
      "ebay_sold",
      "unavailable",
      "No matching eBay sale",
      "The sold-listing search returned nothing whose title matches this card.",
    );
  }
  const when = picked.soldAt ? picked.soldAt.slice(0, 10) : "unknown date";
  return okQuote(
    "ebay_sold",
    picked.priceUsd,
    label,
    `${detailPrefix} Most recent matching sale on ${when}. Median of ${picked.count} matching sale${picked.count === 1 ? "" : "s"} is US$${picked.median.toFixed(2)}.`,
  );
}

async function appToken(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<string | null> {
  const clientId = env.EBAY_CLIENT_ID?.trim() || env.EBAY_APP_ID?.trim();
  const certId = env.EBAY_CLIENT_SECRET?.trim() || env.EBAY_CERT_ID?.trim();
  if (!clientId || !certId) return null;
  const credentials = Buffer.from(`${clientId}:${certId}`).toString("base64");
  const response = await fetchImpl("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: INSIGHTS_SCOPE }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!response.ok || !body.access_token) return null;
  return body.access_token;
}

async function quoteInsights(
  input: PriceInput,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
  usdCadRate: number,
): Promise<PriceQuote | null> {
  const token = await appToken(env, fetchImpl);
  if (!token) return null;
  const marketplace = env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US";
  const category = env.EBAY_CATEGORY_ID?.trim() || "183454";
  const params = new URLSearchParams({
    q: soldsQuery({
      name: input.name,
      setName: input.setName || undefined,
      number: input.number || undefined,
      printedNumber: input.printedNumber || undefined,
      variant: input.variant || undefined,
      language: input.language || undefined,
    }),
    category_ids: category,
    limit: "20",
    filter: "priceCurrency:USD",
  });
  const response = await fetchImpl(
    `https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplace,
      },
      cache: "no-store",
    },
  );
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    return errorQuote("ebay_sold", new Error(`eBay Marketplace Insights failed (${response.status}).`));
  }
  const body = (await response.json()) as unknown;
  const sales = toSold(parseInsightSales(body), usdCadRate);
  return quoteFromSales(
    sales,
    input,
    "eBay last sold · Marketplace Insights",
    "True sold listings from eBay Marketplace Insights (last 90 days).",
  );
}

async function quoteFinding(keywords: string, appId: string, input: PriceInput): Promise<PriceQuote> {
  try {
    const sales = await fetchEbaySolds(keywords, appId);
    return quoteFromSales(
      sales,
      input,
      "eBay last sold · Finding API",
      "Completed listings marked sold by the legacy Finding API. This is real sold data only when eBay still accepts the App ID. It is not Marketplace Insights.",
    );
  } catch (error) {
    if (error instanceof EbayAppIdError) return closedQuote("ebay_sold", "not_connected", "Not connected", error.message);
    return errorQuote("ebay_sold", error);
  }
}

export async function quoteEbaySold(
  input: PriceInput,
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; usdCadRate?: number; ebayAppId?: string; skipFinding?: boolean } = {},
): Promise<PriceQuote> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  const rate = deps.usdCadRate && deps.usdCadRate > 0 ? deps.usdCadRate : 1.37;
  const keywords = soldsQuery({
    name: input.name,
    setName: input.setName || undefined,
    number: input.number || undefined,
    printedNumber: input.printedNumber || undefined,
    variant: input.variant || undefined,
    language: input.language || undefined,
  });

  try {
    const insights = await quoteInsights(input, env, fetchImpl, rate);
    if (insights && insights.status !== "not_connected") return insights;
  } catch (error) {
    return errorQuote("ebay_sold", error);
  }

  const serverAppId = env.EBAY_FINDING_APP_ID?.trim() || env.EBAY_CLIENT_ID?.trim() || env.EBAY_APP_ID?.trim();
  if (!deps.skipFinding && serverAppId) {
    const finding = await quoteFinding(keywords, serverAppId, input);
    if (finding.status !== "not_connected") return finding;
  }

  const phoneAppId = deps.ebayAppId?.trim();
  if (!deps.skipFinding && phoneAppId && phoneAppId !== serverAppId) {
    const finding = await quoteFinding(keywords, phoneAppId, input);
    if (finding.status !== "not_connected") return finding;
  }

  return closedQuote("ebay_sold", "not_connected", "Not connected", EBAY_SOLD_NOT_CONNECTED);
}
