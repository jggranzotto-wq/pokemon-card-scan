import { NextResponse } from "next/server";
import { guardCollection } from "@/lib/http";
import { refreshAllPrices } from "@/lib/prices/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = guardCollection(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { ebayAppId?: string };
  const result = await refreshAllPrices(body.ebayAppId);
  return NextResponse.json(result);
}
