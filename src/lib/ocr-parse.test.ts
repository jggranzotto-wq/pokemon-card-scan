import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOcrText } from "./ocr-parse";

describe("parseOcrText", () => {
  it("pulls name and 4/102 from messy OCR", () => {
    const parsed = parseOcrText("BASIC\nCharizard\nHP 120\nFire Spin\n4/102\nIllustrated by Mitsuhiro Arita");
    assert.equal(parsed.name, "Charizard");
    assert.equal(parsed.collectorNumber, "4");
    assert.equal(parsed.printedTotal, "102");
  });

  it("fuzzy-matches a slightly garbled name", () => {
    const parsed = parseOcrText("Charlzard\nHP 120\n4/102");
    assert.equal(parsed.name, "Charizard");
  });
});
