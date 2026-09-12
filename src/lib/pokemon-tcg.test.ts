import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankCandidates } from "./pokemon-tcg";
import type { PokemonCard } from "../types/card";

function card(partial: Partial<PokemonCard> & Pick<PokemonCard, "id" | "name" | "setName" | "number">): PokemonCard {
  return {
    setId: partial.setId ?? partial.id,
    printedNumber: partial.printedNumber ?? partial.number,
    language: "English",
    images: {},
    variantHints: [],
    ...partial,
  };
}

describe("rankCandidates", () => {
  it("prefers Base Set 4/102 over Base Set 2 4/130", () => {
    const ranked = rankCandidates(
      [
        card({ id: "base4-4", name: "Charizard", setName: "Base Set 2", number: "4", printedNumber: "4/130" }),
        card({ id: "base1-4", name: "Charizard", setName: "Base Set", number: "4", printedNumber: "4/102" }),
        card({ id: "ecard1-6", name: "Charizard", setName: "Expedition Base Set", number: "6", printedNumber: "6/165" }),
      ],
      { name: "Charizard", set: "Base Set", collectorNumber: "4", printedTotal: "102" },
    );
    assert.equal(ranked[0].id, "base1-4");
  });
});
