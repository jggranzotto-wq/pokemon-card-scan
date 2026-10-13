import { NextResponse } from "next/server";
import { deleteCard, getCard, priceHistory, updateCard, type CardInput } from "@/lib/collection-store";
import { usdCadRate } from "@/lib/fx";
import { badRequest, guardCollection, isUuid } from "@/lib/http";
import { refreshCard } from "@/lib/prices/refresh";

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
  const [history, fx] = await Promise.all([priceHistory(id), usdCadRate()]);
  return NextResponse.json({ card, history, fx });
}

export async function PATCH(request: Request, context: Context) {
  const denied = guardCollection(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest("Unknown card.");
  try {
    const body = (await request.json()) as Partial<CardInput> & { ebayAppId?: string; refresh?: boolean };
    const updated = await updateCard(id, body);
    if (!updated) return NextResponse.json({ error: "Card not found." }, { status: 404 });
    if (body.refresh || body.variant || body.condition || body.language) await refreshCard(id, body.ebayAppId);
    const card = await getCard(id);
    const history = await priceHistory(id);
    const fx = await usdCadRate();
    return NextResponse.json({ card, history, fx });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not update the card.");
  }
}

export async function DELETE(request: Request, context: Context) {
  const denied = guardCollection(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest("Unknown card.");
  const removed = await deleteCard(id);
  if (!removed) return NextResponse.json({ error: "Card not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
