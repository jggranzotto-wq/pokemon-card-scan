import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lookupOcrCandidates } from "./pokemon-tcg";
import type { PokemonCard } from "../types/card";

function card(partial: Partial<PokemonCard> & Pick<PokemonCard, "id" | "name" | "number">): PokemonCard {
  return {
    setName: "Obsidian Flames",
    setId: "sv3",
    printedNumber: partial.printedNumber ?? partial.number,
    language: "English",
    images: { small: `https://images.pokemontcg.io/${partial.id}.png` },
    variantHints: [],
    ...partial,
  };
}

describe("lookupOcrCandidates", () => {
  it("loads every printing of the name when the collector number matches nothing", async () => {
    const queries: string[] = [];
    const ex = card({ id: "sv3-223", name: "Charizard ex", number: "223", printedNumber: "223/197" });
    const base = card({ id: "base1-4", name: "Charizard", number: "4", printedNumber: "4/102", setId: "base1" });
    const result = await lookupOcrCandidates({ name: "Charizard", collectorNumber: "7" }, async (query, pageSize) => {
      queries.push(`${query}|${pageSize}`);
      if (query === "name:charizard*") return [ex, base];
      return [];
    });
    assert.ok(queries.some((query) => query.startsWith("name:charizard*|")));
    assert.deepEqual(
      result.map((row) => row.id),
      ["sv3-223", "base1-4"],
    );
  });

  it("also keeps NNN/NNN cards the name search did not return", async () => {
    const queries: string[] = [];
    const ex = card({ id: "sv3-223", name: "Charizard ex", number: "223", printedNumber: "223/197" });
    const other = card({ id: "sv9-223", name: "Pikachu", number: "223", printedNumber: "223/197", setId: "sv9" });
    const result = await lookupOcrCandidates(
      { name: "Charizard", collectorNumber: "223", printedTotal: "197" },
      async (query) => {
        queries.push(query);
        if (query.startsWith("name:")) return [ex];
        if (query === 'number:"223"') return [other];
        return [];
      },
    );
    assert.ok(queries.includes('number:"223"'));
    assert.deepEqual(
      result.map((row) => row.id),
      ["sv3-223", "sv9-223"],
    );
  });
});
