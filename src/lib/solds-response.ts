import type { EbaySoldsStatus, SoldsResponse, SoldListing } from "../types/card";
import type { PublicComps } from "./public-comps";
import { hasPublicMarket, priceChartingSearchUrl } from "./public-comps";
import { ebaySoldSearchUrl, summarizeSolds } from "./solds-summary";

export function buildSoldsResponse(input: {
  query: string;
  fx: { rate: number; label: string };
  sales: SoldListing[];
  publicComps: PublicComps;
  preferRaw: boolean;
  ebayStatus: EbaySoldsStatus;
  ebayError?: string;
}): SoldsResponse {
  const summary = summarizeSolds(input.sales);
  const typical = input.preferRaw && summary.raw ? summary.raw : summary.typical;
  const tcgplayer = input.publicComps.tcgplayer;
  const marketFound = hasPublicMarket(tcgplayer);
  const ebayFound = input.sales.length > 0;

  let source: SoldsResponse["source"] = "none";
  let sourceLabel = input.publicComps.sourceLabel || "No public market comps";
  if (ebayFound) {
    source = "ebay";
    sourceLabel = "eBay sold listings (Finding API)";
  } else if (marketFound) {
    source = "tcgplayer";
    sourceLabel = input.publicComps.sourceLabel || "TCGPlayer market via pokemontcg.io";
  }

  let message = input.publicComps.message;
  if (ebayFound) {
    message = undefined;
  } else if (marketFound) {
    message =
      input.ebayStatus === "skipped"
        ? "TCGPlayer market listings, not eBay solds. Add an App ID if you want live eBay sold listings."
        : input.ebayStatus === "none"
          ? "TCGPlayer market listings. eBay Finding returned no matching solds."
          : input.ebayStatus === "invalid"
            ? "TCGPlayer market listings. eBay rejected that App ID."
            : input.ebayStatus === "error"
              ? "TCGPlayer market listings. eBay solds could not load."
              : undefined;
  } else if (!message) {
    message =
      input.ebayStatus === "invalid"
        ? `${input.publicComps.message ?? "No public comps for this card."} eBay rejected that App ID.`
        : input.publicComps.message;
  }

  return {
    source,
    sourceLabel,
    sourceUrl: tcgplayer?.url || input.publicComps.sourceUrl,
    priceChartingUrl: priceChartingSearchUrl(input.query),
    demo: false,
    usdCadRate: input.fx.rate,
    rateLabel: input.fx.label,
    query: input.query,
    ebaySearchUrl: ebaySoldSearchUrl(input.query),
    sales: input.sales,
    raw: summary.raw,
    graded: summary.graded,
    typical,
    tcgplayer,
    message,
    ebayStatus: input.ebayStatus,
    ebayError: input.ebayError,
  };
}
