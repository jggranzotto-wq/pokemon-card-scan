import { NextResponse } from "next/server";
import { EbayAppIdError, fetchEbaySolds } from "@/lib/ebay";
import { normalizeEbayAppId } from "@/lib/ebay-app-id";
import { usdCadRate } from "@/lib/fx";
import { getCardById } from "@/lib/pokemon-tcg";
import { ebaySoldSearchUrl, soldsQuery, summarizeSolds } from "@/lib/solds-summary";
import type { SoldsResponse } from "@/types/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      cardId?: string;
      name?: string;
      setName?: string;
      number?: string;
      printedNumber?: string;
      variant?: string;
      language?: string;
      preferRaw?: boolean;
      ebayAppId?: string;
    };

    const ebayAppId = normalizeEbayAppId(body.ebayAppId);
    if (!ebayAppId) {
      return NextResponse.json(
        { error: "Add your eBay App ID first.", code: "MISSING_APP_ID" },
        { status: 400 },
      );
    }

    const card = body.cardId ? await getCardById(body.cardId) : null;
    const name = (body.name || card?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Need a card name to search solds." }, { status: 400 });
    }

    const query = soldsQuery({
      name,
      setName: body.setName || card?.setName,
      number: body.number || card?.number,
      printedNumber: body.printedNumber || card?.printedNumber,
      variant: body.variant,
      language: body.language || card?.language,
    });

    const fx = await usdCadRate();
    const sales = await fetchEbaySolds(query, ebayAppId);
    const preferRaw = body.preferRaw !== false;
    const summary = summarizeSolds(sales);
    const typical = preferRaw && summary.raw ? summary.raw : summary.typical;

    const response: SoldsResponse = {
      source: "ebay",
      sourceLabel: sales.length
        ? "eBay sold listings (Finding API)"
        : "eBay solds — no matching sold listings",
      demo: false,
      usdCadRate: fx.rate,
      rateLabel: fx.label,
      query,
      ebaySearchUrl: ebaySoldSearchUrl(query),
      sales,
      raw: summary.raw,
      graded: summary.graded,
      typical,
      tcgplayer: card?.tcgplayer,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof EbayAppIdError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Solds lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
