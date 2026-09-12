import { detectGrade } from "./grades";
import { parseMoney } from "./money";
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

export function hasEbayAppId(): boolean {
  return Boolean(process.env.EBAY_APP_ID?.trim());
}

export async function fetchEbaySolds(keywords: string): Promise<SoldListing[]> {
  if (!hasEbayAppId()) return [];

  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": process.env.EBAY_APP_ID!.trim(),
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
    { next: { revalidate: 0 } },
  );
  if (!res.ok) {
    throw new Error(`eBay Finding API failed (${res.status})`);
  }

  const json = (await res.json()) as FindingResponse;
  const body = json.findCompletedItemsResponse?.[0];
  const ack = body?.ack?.[0];
  if (ack && ack !== "Success" && ack !== "Warning") {
    const message = body?.errorMessage?.[0]?.error?.[0]?.message?.[0] ?? ack;
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
