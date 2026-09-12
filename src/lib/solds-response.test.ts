import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSoldsResponse } from "./solds-response";
import { NO_COMPS_MESSAGE } from "./public-comps";
import type { SoldListing } from "../types/card";

const fx = { rate: 1.4, label: "approx CAD (test)" };
const tcgplayer = {
  url: "https://prices.pokemontcg.io/tcgplayer/base1-4",
  printing: "holofoil",
  marketUsd: 869.02,
  lowUsd: 449.99,
  midUsd: 902.5,
  highUsd: 3499.1,
  updatedAt: "2026/09/12",
};

function sale(priceUsd: number): SoldListing {
  return {
    id: String(priceUsd),
    title: "Charizard 4/102 Base Set raw",
    priceUsd,
    soldAt: "2026-09-01",
    grade: "Raw",
    isGraded: false,
    url: "https://www.ebay.com/itm/1",
  };
}

describe("buildSoldsResponse", () => {
  it("uses public TCGPlayer comps when no App ID is saved", () => {
    const res = buildSoldsResponse({
      query: "Charizard 4/102 Pokemon Base Set",
      fx,
      sales: [],
      publicComps: {
        found: true,
        tcgplayer,
        sourceUrl: tcgplayer.url,
        sourceLabel: "TCGPlayer market via pokemontcg.io",
      },
      preferRaw: true,
      ebayStatus: "skipped",
    });
    assert.equal(res.source, "tcgplayer");
    assert.equal(res.demo, false);
    assert.equal(res.tcgplayer?.marketUsd, 869.02);
    assert.equal(res.tcgplayer?.midUsd, 902.5);
    assert.equal(res.sales.length, 0);
    assert.equal(res.ebayStatus, "skipped");
    assert.match(res.message ?? "", /not eBay solds/i);
    assert.match(res.ebaySearchUrl, /ebay\.com/);
    assert.match(res.priceChartingUrl, /pricecharting\.com/);
    assert.equal(res.sourceUrl, tcgplayer.url);
  });

  it("prefers live eBay solds when Finding returns them", () => {
    const res = buildSoldsResponse({
      query: "Charizard 4/102 Pokemon Base Set",
      fx,
      sales: [sale(800), sale(910)],
      publicComps: {
        found: true,
        tcgplayer,
        sourceUrl: tcgplayer.url,
        sourceLabel: "TCGPlayer market via pokemontcg.io",
      },
      preferRaw: true,
      ebayStatus: "ok",
    });
    assert.equal(res.source, "ebay");
    assert.equal(res.sales.length, 2);
    assert.equal(res.raw?.count, 2);
    assert.equal(res.tcgplayer?.marketUsd, 869.02);
    assert.equal(res.message, undefined);
  });

  it("says so clearly when there are no public comps", () => {
    const res = buildSoldsResponse({
      query: "Sky Legend GX Pokemon",
      fx,
      sales: [],
      publicComps: {
        found: false,
        sourceLabel: "No public market comps",
        message: NO_COMPS_MESSAGE,
      },
      preferRaw: true,
      ebayStatus: "skipped",
    });
    assert.equal(res.source, "none");
    assert.equal(res.tcgplayer, undefined);
    assert.equal(res.message, NO_COMPS_MESSAGE);
    assert.doesNotMatch(res.message ?? "", /US\$\d/);
  });

  it("keeps public comps if an App ID is rejected", () => {
    const res = buildSoldsResponse({
      query: "Charizard 4/102 Pokemon Base Set",
      fx,
      sales: [],
      publicComps: {
        found: true,
        tcgplayer,
        sourceUrl: tcgplayer.url,
        sourceLabel: "TCGPlayer market via pokemontcg.io",
      },
      preferRaw: true,
      ebayStatus: "invalid",
      ebayError: "eBay rejected that App ID.",
    });
    assert.equal(res.source, "tcgplayer");
    assert.equal(res.tcgplayer?.lowUsd, 449.99);
    assert.match(res.message ?? "", /rejected that App ID/);
    assert.equal(res.ebayError, "eBay rejected that App ID.");
  });
});
