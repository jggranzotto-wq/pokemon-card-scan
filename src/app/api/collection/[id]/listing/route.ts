import { NextResponse } from "next/server";
import { adjustQuantity, getCard } from "@/lib/collection-store";
import { ebaySellerConnected, ebaySellConfigured, buildListingDraft, publishListing } from "@/lib/ebay-sell";
import { usdCadRate } from "@/lib/fx";
import { badRequest, guardCollection, isUuid } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const denied = guardCollection(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest("Unknown card.");
  const card = await getCard(id);
  if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });
  const fx = await usdCadRate();
  const draft = buildListingDraft(card, fx, {
    sellerConnected: await ebaySellerConnected(),
    configured: ebaySellConfigured(),
  });
  return NextResponse.json({ draft, fx, card });
}

export async function POST(request: Request, context: Context) {
  const denied = guardCollection(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest("Unknown card.");
  const body = (await request.json()) as {
    confirm?: boolean;
    title?: string;
    description?: string;
    price?: number;
    currency?: "USD" | "CAD";
    quantity?: number;
  };
  if (body.confirm !== true) {
    return badRequest("Confirm the listing before it is posted. Nothing was sent to eBay.");
  }
  const card = await getCard(id);
  if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });
  try {
    const result = await publishListing({
      card,
      title: body.title || "",
      description: body.description || "",
      price: Number(body.price),
      currency: body.currency === "CAD" ? "CAD" : "USD",
      quantity: Number(body.quantity),
    });
    await adjustQuantity(id, -Number(body.quantity));
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "eBay did not accept the listing. Nothing was marked as posted." },
      { status: 502 },
    );
  }
}
