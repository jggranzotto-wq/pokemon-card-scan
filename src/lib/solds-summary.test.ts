import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeSolds, soldsQuery } from "./solds-summary";
import type { SoldListing } from "../types/card";

function sale(priceUsd: number, isGraded: boolean): SoldListing {
  return {
    id: String(priceUsd),
    title: "x",
    priceUsd,
    soldAt: "2026-01-01",
    grade: isGraded ? "PSA 9" : "Raw",
    isGraded,
  };
}

describe("summarizeSolds", () => {
  it("splits raw and graded bands", () => {
    const summary = summarizeSolds([sale(10, false), sale(20, false), sale(80, true)]);
    assert.equal(summary.raw?.count, 2);
    assert.equal(summary.raw?.median, 15);
    assert.equal(summary.graded?.count, 1);
    assert.equal(summary.graded?.median, 80);
  });
});

describe("soldsQuery", () => {
  it("uses name, collector number, and set so comps stay tight", () => {
    assert.equal(
      soldsQuery({ name: "Pikachu", setName: "Base", number: "58", printedNumber: "58/102", variant: "holo" }),
      "Pikachu 58/102 Pokemon Base holo",
    );
    assert.equal(
      soldsQuery({ name: "Charizard", setName: "Base Set", printedNumber: "4/102" }),
      "Charizard 4/102 Pokemon Base Set",
    );
  });
});
