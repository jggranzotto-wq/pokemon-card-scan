import { NextResponse } from "next/server";
import { exampleSolds } from "@/lib/example-solds";
import { fetchEbaySolds, hasEbayAppId } from "@/lib/ebay";
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
      variant?: string;
      language?: string;
      preferRaw?: boolean;
    };

    const card = body.cardId ? await getCardById(body.cardId) : null;
    const name = (body.name || card?.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Need a card name to search solds." }, { status: 400 });
    }

    const query = soldsQuery({
      name,
      setName: body.setName || card?.setName,
      number: body.number || card?.number,
      variant: body.variant,
      language: body.language || card?.language,
    });

    const fx = await usdCadRate();
    let sales = [];
    let source: SoldsResponse["source"] = "example";
    let sourceLabel = "Example data — not live solds";
    let demo = true;

    if (hasEbayAppId()) {
      try {
        sales = await fetchEbaySolds(query);
        if (sales.length) {
          source = "ebay";
          sourceLabel = "eBay sold listings (Finding API)";
          demo = false;
        } else {
          sourceLabel = "Example data — not live solds (eBay returned no solds)";
          sales = exampleSolds(name, body.setName || card?.setName, body.number || card?.number);
        }
      } catch {
        sourceLabel = "Example data — not live solds (eBay solds unavailable)";
        sales = exampleSolds(name, body.setName || card?.setName, body.number || card?.number);
      }
    } else {
      sales = exampleSolds(name, body.setName || card?.setName, body.number || card?.number);
    }

    const preferRaw = body.preferRaw !== false;
    const summary = summarizeSolds(sales);
    const typical = preferRaw && summary.raw ? summary.raw : summary.typical;

    const response: SoldsResponse = {
      source,
      sourceLabel,
      demo,
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
    const message = error instanceof Error ? error.message : "Solds lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
