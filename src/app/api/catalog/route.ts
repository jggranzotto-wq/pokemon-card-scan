import { NextResponse } from "next/server";
import { yearsFromSets } from "@/lib/catalog";
import { listCatalogSets } from "@/lib/pokemon-tcg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sets = await listCatalogSets();
    return NextResponse.json({
      years: yearsFromSets(sets),
      sets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
