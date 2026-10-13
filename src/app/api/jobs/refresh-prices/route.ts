import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/collection-auth";
import { hasDatabase } from "@/lib/db";
import { refreshAllPrices } from "@/lib/prices/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL is not set." }, { status: 503 });
  }
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "CRON_SECRET did not match." }, { status: 401 });
  }
  const result = await refreshAllPrices();
  return NextResponse.json(result);
}
