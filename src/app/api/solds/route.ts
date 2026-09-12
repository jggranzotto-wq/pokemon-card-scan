import { NextResponse } from "next/server";
import { EbayAppIdError, fetchEbaySolds } from "@/lib/ebay";
import { normalizeEbayAppId } from "@/lib/ebay-app-id";
import { usdCadRate } from "@/lib/fx";
import { fetchPublicComps } from "@/lib/public-comps";
import { buildSoldsResponse } from "@/lib/solds-response";
import { soldsQuery } from "@/lib/solds-summary";
import type { EbaySoldsStatus, SoldListing } from "@/types/card";

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

    const name = (body.name || "").trim();
    const publicComps = await fetchPublicComps({
      cardId: body.cardId,
      name: name || "",
      setName: body.setName,
      number: body.number,
      printedNumber: body.printedNumber,
      language: body.language,
    });

    const resolvedName = (name || publicComps.card?.name || "").trim();
    if (!resolvedName) {
      return NextResponse.json({ error: "Need a card name to search comps." }, { status: 400 });
    }

    const query = soldsQuery({
      name: resolvedName,
      setName: body.setName || publicComps.card?.setName,
      number: body.number || publicComps.card?.number,
      printedNumber: body.printedNumber || publicComps.card?.printedNumber,
      variant: body.variant,
      language: body.language || publicComps.card?.language,
    });

    const fx = await usdCadRate();
    const preferRaw = body.preferRaw !== false;
    const ebayAppId = normalizeEbayAppId(body.ebayAppId);

    let sales: SoldListing[] = [];
    let ebayStatus: EbaySoldsStatus = "skipped";
    let ebayError: string | undefined;

    if (ebayAppId) {
      try {
        sales = await fetchEbaySolds(query, ebayAppId);
        ebayStatus = sales.length ? "ok" : "none";
      } catch (error) {
        if (error instanceof EbayAppIdError) {
          ebayStatus = "invalid";
          ebayError = error.message;
        } else {
          ebayStatus = "error";
          ebayError = error instanceof Error ? error.message : "eBay solds could not load.";
        }
      }
    }

    return NextResponse.json(
      buildSoldsResponse({
        query,
        fx,
        sales,
        publicComps,
        preferRaw,
        ebayStatus,
        ebayError,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Comps lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
