import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identifyOcrPhoto } from "./ocr-identify";
import { OCR_UNCLEAR_MESSAGE } from "./ocr-match";
import { VISION_QUOTA_NOTE } from "./vision-messages";
import type { PokemonCard } from "../types/card";

function card(id: string, name: string, number: string, printedNumber: string): PokemonCard {
  return {
    id,
    name,
    setName: "Base Set",
    setId: "base1",
    number,
    printedNumber,
    language: "English",
    images: { small: `https://images.pokemontcg.io/${id}.png` },
    variantHints: [],
  };
}

const charizard = card("base1-4", "Charizard", "4", "4/102");
const other = card("base4-4", "Charizard", "4", "4/130");

describe("identifyOcrPhoto", () => {
  it("passes the quota notice through and auto-selects a strong image match", async () => {
    const result = await identifyOcrPhoto({
      extracted: { name: "Charizard", collectorNumber: "4", printedTotal: "102" },
      photo: Buffer.from("photo"),
      notice: VISION_QUOTA_NOTE,
      visionAvailable: true,
      lookup: async () => [charizard, other],
      distancesFor: async () =>
        new Map([
          ["base1-4", 6],
          ["base4-4", 20],
        ]),
    });
    assert.equal(result.method, "ocr");
    assert.equal(result.notice, VISION_QUOTA_NOTE);
    assert.equal(result.autoSelectedId, "base1-4");
    assert.equal(result.visionAvailable, true);
  });

  it("asks for a name search when a text-only read lacks both a name and a number", async () => {
    const result = await identifyOcrPhoto({
      extracted: { name: "Charizard" },
      lookup: async () => [charizard],
    });
    assert.deepEqual(result.candidates, []);
    assert.equal(result.autoSelectedId, undefined);
    assert.equal(result.message, OCR_UNCLEAR_MESSAGE);
  });
});
