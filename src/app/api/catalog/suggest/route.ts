import { NextResponse } from "next/server";
import { mergeNameSuggestions } from "@/lib/catalog";
import { suggestCatalogNames } from "@/lib/pokemon-tcg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ names: [] });
  }
  try {
    const catalogNames = await suggestCatalogNames(q);
    return NextResponse.json({ names: mergeNameSuggestions(q, catalogNames) });
  } catch {
    return NextResponse.json({ names: mergeNameSuggestions(q, []) });
  }
}
