import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { appPublicUrl, authorizeUrl, ebayConfig, ebaySellConfigured } from "@/lib/ebay-sell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const back = appPublicUrl();
  if (!hasDatabase()) return NextResponse.redirect(`${back}/settings?ebay=no-database`);
  if (!ebaySellConfigured()) return NextResponse.redirect(`${back}/settings?ebay=not-configured`);
  return NextResponse.redirect(authorizeUrl(ebayConfig()));
}
