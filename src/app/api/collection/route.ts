import { NextResponse } from "next/server";
import { createCard, listCards, recomputeTotals, type CardInput } from "@/lib/collection-store";
import { collectionDay } from "@/lib/day";
import { usdCadRate } from "@/lib/fx";
import { guardCollection, badRequest } from "@/lib/http";
import { refreshCard } from "@/lib/prices/refresh";
import { decodeThumbnail, fetchCatalogThumbnail } from "@/lib/thumbnail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = guardCollection(request);
  if (denied) return denied;
  const [cards, totals, fx] = await Promise.all([listCards(), recomputeTotals(collectionDay()), usdCadRate()]);
  return NextResponse.json({ cards, totals, fx, day: collectionDay() });
}

export async function POST(request: Request) {
  const denied = guardCollection(request);
  if (denied) return denied;
  try {
    const body = (await request.json()) as CardInput & { thumbnailBase64?: string; ebayAppId?: string };
    let thumbnail = null;
    try {
      thumbnail = decodeThumbnail(body.thumbnailBase64);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Thumbnail was rejected.");
    }
    if (!thumbnail && body.imageUrl) thumbnail = await fetchCatalogThumbnail(body.imageUrl);
    const id = await createCard(body, thumbnail);
    await refreshCard(id, body.ebayAppId);
    const cards = await listCards();
    const card = cards.find((item) => item.id === id);
    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not save the card.");
  }
}
