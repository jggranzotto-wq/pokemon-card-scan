import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogNameToken,
  collectorMatches,
  decideOcrIdentification,
  fuzzyNameQuery,
  namesAreFuzzyMatch,
  OCR_UNCLEAR_MESSAGE,
  selectOcrPool,
} from "./ocr-match";
import type { PokemonCard } from "../types/card";

function card(partial: Partial<PokemonCard> & Pick<PokemonCard, "id" | "name" | "number">): PokemonCard {
  return {
    setName: partial.setName ?? partial.id,
    setId: partial.setId ?? partial.id,
    printedNumber: partial.printedNumber ?? partial.number,
    language: "English",
    images: { small: `https://images.pokemontcg.io/${partial.id}.png` },
    variantHints: [],
    ...partial,
  };
}

const charizard = card({
  id: "base1-4",
  name: "Charizard",
  setName: "Base Set",
  number: "4",
  printedNumber: "4/102",
});
const otherCharizard = card({
  id: "base4-4",
  name: "Charizard",
  setName: "Base Set 2",
  number: "4",
  printedNumber: "4/130",
});
const pikachu = card({ id: "base1-58", name: "Pikachu", number: "58", printedNumber: "58/102" });

describe("ocr narrowing", () => {
  it("searches every printing of a fuzzy name, including a one-character miss", () => {
    assert.equal(catalogNameToken("Charizard"), "charizard");
    assert.equal(catalogNameToken("Charizad"), "charizard");
    assert.equal(fuzzyNameQuery("Charizard"), "name:charizard*");
  });

  it("fuzzy-matches a name and a collector number like 223/197", () => {
    assert.equal(namesAreFuzzyMatch("Charizard", "Charzard"), true);
    assert.equal(namesAreFuzzyMatch("Pikachu", "Charizard"), false);
    assert.equal(
      collectorMatches(card({ id: "sv8-223", name: "Pikachu", number: "223", printedNumber: "223/197" }), {
        collectorNumber: "223",
        printedTotal: "197",
      }),
      true,
    );
    assert.equal(
      collectorMatches(card({ id: "sv8-223", name: "Pikachu", number: "223", printedNumber: "223/191" }), {
        collectorNumber: "223",
        printedTotal: "197",
      }),
      false,
    );
  });

  it("keeps a name match or a number match, with both first", () => {
    const pool = selectOcrPool([pikachu, otherCharizard, charizard], {
      name: "Charizard",
      collectorNumber: "4",
      printedTotal: "102",
    });
    assert.deepEqual(
      pool.map((row) => row.id),
      ["base1-4", "base4-4"],
    );
  });
});

describe("decideOcrIdentification", () => {
  it("returns no candidates and the search message when OCR found nothing", () => {
    const decision = decideOcrIdentification({ extracted: {}, cards: [charizard] });
    assert.deepEqual(decision.candidates, []);
    assert.equal(decision.autoSelectedId, undefined);
    assert.equal(decision.message, OCR_UNCLEAR_MESSAGE);
  });

  it("suggests text-only candidates only when the name and number both match, and does not auto-select", () => {
    const both = decideOcrIdentification({
      extracted: { name: "Charizard", collectorNumber: "4", printedTotal: "102" },
      cards: [charizard, otherCharizard, pikachu],
    });
    assert.deepEqual(both.candidates.map((row) => row.id), ["base1-4"]);
    assert.equal(both.autoSelectedId, undefined);

    const nameOnly = decideOcrIdentification({
      extracted: { name: "Charizard" },
      cards: [charizard, pikachu],
    });
    assert.deepEqual(nameOnly.candidates, []);
    assert.equal(nameOnly.message, OCR_UNCLEAR_MESSAGE);
  });

  it("auto-selects only a strong image match", () => {
    const strong = decideOcrIdentification({
      extracted: { name: "Charzard", collectorNumber: "4" },
      cards: [charizard, otherCharizard],
      distances: new Map([
        ["base1-4", 8],
        ["base4-4", 22],
      ]),
    });
    assert.equal(strong.autoSelectedId, "base1-4");

    const close = decideOcrIdentification({
      extracted: { name: "Charizard", collectorNumber: "4" },
      cards: [charizard, otherCharizard],
      distances: new Map([
        ["base1-4", 8],
        ["base4-4", 10],
      ]),
    });
    assert.equal(close.autoSelectedId, undefined);
    assert.deepEqual(close.candidates.map((row) => row.id), ["base1-4", "base4-4"]);
  });

  it("keeps name printings when the collector number matches nothing, and shows them unless the image match is clear", () => {
    const ex = card({ id: "sv3-223", name: "Charizard ex", number: "223", printedNumber: "223/197" });
    const pool = selectOcrPool([ex, pikachu, charizard], { name: "Charizard", collectorNumber: "7" });
    assert.deepEqual(
      pool.map((row) => row.id),
      ["sv3-223", "base1-4"],
    );

    const ranked = decideOcrIdentification({
      extracted: { name: "Charizard", collectorNumber: "7" },
      cards: [charizard, ex],
      distances: new Map([
        ["sv3-223", 18],
        ["base1-4", 30],
      ]),
    });
    assert.equal(ranked.candidates[0].id, "sv3-223");
    assert.equal(ranked.autoSelectedId, "sv3-223");

    const close = decideOcrIdentification({
      extracted: { name: "Charizard", collectorNumber: "7" },
      cards: [charizard, ex],
      distances: new Map([
        ["sv3-223", 18],
        ["base1-4", 24],
      ]),
    });
    assert.equal(close.autoSelectedId, undefined);
    assert.deepEqual(close.candidates.map((row) => row.id), ["sv3-223", "base1-4"]);
  });

  it("shows a weak name match as a thumbnail instead of dropping it", () => {
    const decision = decideOcrIdentification({
      extracted: { name: "Charizard" },
      cards: [charizard, pikachu],
      distances: new Map([
        ["base1-4", 40],
        ["base1-58", 42],
      ]),
    });
    assert.deepEqual(decision.candidates.map((row) => row.id), ["base1-4"]);
    assert.equal(decision.autoSelectedId, undefined);
    assert.equal(decision.message, undefined);
  });
});
