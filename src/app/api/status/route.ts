import { NextResponse } from "next/server";
import { collectionPassword } from "@/lib/collection-auth";
import { hasDatabase } from "@/lib/db";
import { ebayEnvironment, ebaySellConfigured, ebaySellerConnected } from "@/lib/ebay-sell";
import { visionProvider } from "@/lib/vision";
import type { StatusResponse } from "@/types/card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const provider = visionProvider();
  const clientId = Boolean(process.env.EBAY_CLIENT_ID?.trim() || process.env.EBAY_APP_ID?.trim());
  const certId = Boolean(process.env.EBAY_CLIENT_SECRET?.trim() || process.env.EBAY_CERT_ID?.trim());
  const finding = Boolean(process.env.EBAY_FINDING_APP_ID?.trim() || clientId);
  let seller = false;
  if (hasDatabase()) {
    try {
      seller = await ebaySellerConnected();
    } catch {
      seller = false;
    }
  }
  const body: StatusResponse = {
    vision: Boolean(provider),
    visionProvider: provider ?? undefined,
    ebay: false,
    pokemonTcgKey: Boolean(process.env.POKEMONTCG_API_KEY),
    database: hasDatabase(),
    collectionPassword: Boolean(collectionPassword()),
    collectr: process.env.COLLECTR_API_KEY?.trim() ? "connected" : "not_connected",
    ebaySold: clientId && certId ? "insights" : finding ? "finding" : "not_connected",
    ebaySell: ebaySellConfigured() ? ebayEnvironment() : "not_configured",
    ebaySellerConnected: seller,
  };
  return NextResponse.json(body);
}
