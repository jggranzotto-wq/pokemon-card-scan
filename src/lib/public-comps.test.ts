import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPS_BLOCKED_MESSAGE,
  NO_COMPS_MESSAGE,
  hasPublicMarket,
  priceChartingSearchUrl,
  printedTotalFrom,
} from "./public-comps";

describe("printedTotalFrom", () => {
  it("reads the printed total after the slash", () => {
    assert.equal(printedTotalFrom("4/102"), "102");
    assert.equal(printedTotalFrom("020/M-P"), "M-P");
    assert.equal(printedTotalFrom("4"), undefined);
  });
});

describe("hasPublicMarket", () => {
  it("accepts a TCGPlayer market or range", () => {
    assert.equal(hasPublicMarket({ marketUsd: 869.02 }), true);
    assert.equal(hasPublicMarket({ lowUsd: 10, midUsd: 20, highUsd: 40 }), true);
    assert.equal(hasPublicMarket({ url: "https://example.com" }), false);
    assert.equal(hasPublicMarket(undefined), false);
  });
});

describe("priceChartingSearchUrl", () => {
  it("links out to a PriceCharting search for the recognized card", () => {
    const url = priceChartingSearchUrl("Charizard 4/102 Pokemon Base Set");
    assert.match(url, /^https:\/\/www\.pricecharting\.com\/search-products\?/);
    assert.match(url, /Charizard/);
    assert.match(url, /type=pokemon-cards/);
  });
});

describe("honest empty copy", () => {
  it("does not invent a price when comps are missing or blocked", () => {
    assert.match(NO_COMPS_MESSAGE, /unofficial|custom|promo/i);
    assert.match(COMPS_BLOCKED_MESSAGE, /did not return data/i);
    assert.doesNotMatch(NO_COMPS_MESSAGE, /\$\d/);
  });
});
