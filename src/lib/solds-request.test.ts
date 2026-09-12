import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { soldsRequestBody } from "./solds-request";
import type { PokemonCard } from "../types/card";

const pikachu: PokemonCard = {
  id: "base1-58",
  name: "Pikachu",
  setName: "Base",
  setId: "base1",
  number: "58",
  printedNumber: "58/102",
  language: "English",
  images: {},
  variantHints: [],
};

describe("soldsRequestBody", () => {
  it("does not keep the previous card in the eBay query", () => {
    const staleCharizard = {
      name: "Charizard",
      set: "Base Set",
      collectorNumber: "4",
    };
    const body = soldsRequestBody(pikachu, staleCharizard);
    assert.equal(body.name, "Pikachu");
    assert.equal(body.setName, "Base");
    assert.equal(body.number, "58");
    assert.equal(body.cardId, "base1-58");
  });
});
