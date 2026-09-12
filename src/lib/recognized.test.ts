import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardIdentity, recognizedLabel } from "./recognized";
import type { PokemonCard } from "../types/card";

const charizard: PokemonCard = {
  id: "base1-4",
  name: "Charizard",
  setName: "Base Set",
  setId: "base1",
  number: "4",
  printedNumber: "4/102",
  rarity: "Rare Holo",
  setYear: 1999,
  language: "English",
  images: {},
  variantHints: [],
};

describe("recognizedLabel", () => {
  it("shows name and collector number from the photo extract", () => {
    assert.equal(
      recognizedLabel({ name: "Charizard", collectorNumber: "4", printedTotal: "102" }),
      "Charizard 4/102",
    );
  });

  it("prefers the confirmed card number when the user taps a match", () => {
    assert.equal(recognizedLabel({ name: "Charizard", collectorNumber: "4" }, charizard), "Charizard 4/102");
  });
});

describe("cardIdentity", () => {
  it("shows official name, number, set, year, and rarity", () => {
    assert.deepEqual(cardIdentity({ name: "Charizard", collectorNumber: "4" }, charizard), {
      name: "Charizard",
      number: "4/102",
      setName: "Base Set",
      year: "1999",
      rarity: "Rare Holo",
    });
  });

  it("shows Unknown instead of inventing missing fields", () => {
    assert.deepEqual(cardIdentity({ name: "Charizard", collectorNumber: "4", printedTotal: "102" }), {
      name: "Charizard",
      number: "4/102",
      setName: "Unknown",
      year: "Unknown",
      rarity: "Unknown",
    });
  });

  it("uses a printed copyright year only when the catalog has no set year", () => {
    const identity = cardIdentity(
      { name: "Charizard", collectorNumber: "4", copyrightYear: 1999 },
      { ...charizard, setYear: null, rarity: undefined },
    );
    assert.equal(identity.year, "1999");
    assert.equal(identity.rarity, "Unknown");
  });
});
