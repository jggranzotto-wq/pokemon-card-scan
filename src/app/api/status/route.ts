import { NextResponse } from "next/server";
import { hasEbayAppId } from "@/lib/ebay";
import { visionProvider } from "@/lib/vision";
import type { StatusResponse } from "@/types/card";

export const dynamic = "force-dynamic";

export function GET() {
  const provider = visionProvider();
  const body: StatusResponse = {
    vision: Boolean(provider),
    visionProvider: provider ?? undefined,
    ebay: hasEbayAppId(),
    pokemonTcgKey: Boolean(process.env.POKEMONTCG_API_KEY),
  };
  return NextResponse.json(body);
}
