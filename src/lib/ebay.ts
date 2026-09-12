import { detectGrade } from "./grades";
import { parseMoney } from "./money";
import { normalizeEbayAppId } from "./ebay-app-id";
import type { SoldListing } from "../types/card";

type FindingItem = {
  itemId?: string[];
  title?: string[];
  viewItemURL?: string[];
  galleryURL?: string[];
  sellingStatus?: {
    currentPrice?: { "@currencyId"?: string; __value__?: string }[];
  }[];
  listingInfo?: { endTime?: string[] }[];
};

type FindingResponse = {
  findCompletedItemsResponse?: {
    ack?: string[];
    searchResult?: { item?: FindingItem[]; "@count"?: string }[];
    errorMessage?: { error?: { message?: string[] }[] }[];
  }[];
};

export class EbayAppIdError extends Error {
  code: "MISSING_APP_ID" | "INVALID_APP_ID";
  constructor(message: string, code: "MISSING_APP_ID" | "INVALID_APP_ID") {
    super(message);
    this.code = code;
  }
}

function isAuthFailure(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true;
  return /app(lication)? id|client id|security-appname|invalid.*key|unauthorized|authentication/i.test(
    message,
  );
}

export async function fetchEbaySolds(keywords: string, appId: string): Promise<SoldListing[]> {
  const securityAppName = normalizeEbayAppId(appId);
  if (!securityAppName) {
    throw new EbayAppIdError("Add your eBay App ID first.", "MISSING_APP_ID");
  }

  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": securityAppName,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "",
    keywords,
    categoryId: "183454",
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "itemFilter(1).name": "Currency",
    "itemFilter(1).value": "USD",
    "paginationInput.entriesPerPage": "20",
    sortOrder: "EndTimeSoonest",
  });

  const res = await fetch(
    `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const hint = `eBay Finding API failed (${res.status})`;
    if (isAuthFailure(res.status, hint)) {
      throw new EbayAppIdError(
        "eBay rejected that App ID. Check Application Keys → App ID / Client ID.",
        "INVALID_APP_ID",
      );
    }
    throw new Error(hint);
  }

  const json = (await res.json()) as FindingResponse;
  const body = json.findCompletedItemsResponse?.[0];
  const ack = body?.ack?.[0];
  const message = body?.errorMessage?.[0]?.error?.[0]?.message?.[0] ?? ack ?? "";
  if (ack && ack !== "Success" && ack !== "Warning") {
    if (isAuthFailure(res.status, message)) {
      throw new EbayAppIdError(
        "eBay rejected that App ID. Check Application Keys → App ID / Client ID.",
        "INVALID_APP_ID",
      );
    }
    throw new Error(`eBay Finding API: ${message}`);
  }

  const items = body?.searchResult?.[0]?.item ?? [];
  const sales: SoldListing[] = [];

  for (const item of items) {
    const title = item.title?.[0] ?? "Sold listing";
    const price = parseMoney(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__);
    if (!price) continue;
    const { grade, isGraded } = detectGrade(title);
    sales.push({
      id: item.itemId?.[0] ?? title,
      title,
      priceUsd: price,
      soldAt: item.listingInfo?.[0]?.endTime?.[0] ?? new Date().toISOString(),
      grade,
      isGraded,
      url: item.viewItemURL?.[0],
      image: item.galleryURL?.[0],
    });
  }

  return sales;
}
