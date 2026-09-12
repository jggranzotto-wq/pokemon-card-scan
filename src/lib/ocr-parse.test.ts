import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlausibleCardName, parseOcrText } from "./ocr-parse";

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

  it("reads a printed copyright year and ignores HP", () => {
    const parsed = parseOcrText("Charizard\nHP 120\n4/102\n©1999 Nintendo");
    assert.equal(parsed.copyrightYear, 1999);
  });

  it("maps Japanese species names to English and reads promo numbers", () => {
    const parsed = parseOcrText("ピカチュウ\nHP 70\n020/M-P\n©2021 Pokémon");
    assert.equal(parsed.name, "Pikachu");
    assert.equal(parsed.collectorNumber, "20");
    assert.equal(parsed.printedTotal, "M-P");
    assert.equal(parsed.language, "Japanese");
  });

  it("keeps a printed English GX name that is not in the species list", () => {
    const parsed = parseOcrText("Sky Legend GX\nTrinity Burn\nHP 210");
    assert.equal(parsed.name, "Sky Legend GX");
  });

  it("does not treat OCR punctuation soup as a name", () => {
    const parsed = parseOcrText("’;|:®:NI\nweakness\nresistance");
    assert.equal(parsed.name, undefined);
    assert.equal(isPlausibleCardName("’;|:®:NI"), false);
    assert.equal(isPlausibleCardName("ooVETEE)"), false);
    assert.equal(isPlausibleCardName("Pikachu"), true);
  });
});
