import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterSetsByYear,
  mergeNameSuggestions,
  noManualMatchMessage,
  parseCollectorInput,
  preferDisplaySetName,
  suggestLocalNames,
  yearsFromSets,
} from "./catalog";
import type { CatalogSet } from "../types/card";

const sets: CatalogSet[] = [
  { id: "base1", name: "Base Set", year: 1999 },
  { id: "base2", name: "Jungle", year: 1999 },
  { id: "sv2", name: "Paldea Evolved", year: 2023 },
  { id: "unknown", name: "No Date Set", year: null },
];

describe("yearsFromSets", () => {
  it("uses official release years only, newest first", () => {
    assert.deepEqual(yearsFromSets(sets), [2023, 1999]);
  });
});

describe("filterSetsByYear", () => {
  it("filters to official sets from that year", () => {
    assert.deepEqual(
      filterSetsByYear(sets, 1999).map((s) => s.name),
      ["Base Set", "Jungle"],
    );
  });

  it("keeps every official set when no year is picked", () => {
    assert.equal(filterSetsByYear(sets).length, 4);
  });
});

describe("preferDisplaySetName", () => {
  it("prefers Base Set over the short pokemontcg.io name", () => {
    assert.equal(preferDisplaySetName("Base", "Base Set"), "Base Set");
  });
});

describe("suggestLocalNames", () => {
  it("suggests catalog species as the user types", () => {
    const names = suggestLocalNames("chari");
    assert.ok(names.includes("Charizard"));
    assert.ok(!names.includes("Pikachu"));
  });

  it("does not invent a name", () => {
    assert.deepEqual(suggestLocalNames("Sky Legend"), []);
  });
});

describe("mergeNameSuggestions", () => {
  it("puts catalog card titles first", () => {
    const names = mergeNameSuggestions("char", ["Charizard VMAX", "Charizard"]);
    assert.equal(names[0], "Charizard VMAX");
    assert.ok(names.includes("Charizard"));
  });
});

describe("parseCollectorInput", () => {
  it("reads 4/102 as number and printed total", () => {
    assert.deepEqual(parseCollectorInput("4/102"), { collectorNumber: "4", printedTotal: "102" });
  });
});

describe("noManualMatchMessage", () => {
  it("says nothing matched instead of inventing a card", () => {
    const message = noManualMatchMessage({ name: "Sky Legend GX", year: 2019, setName: "Cosmic Eclipse" });
    assert.match(message, /No catalog match/);
    assert.match(message, /Sky Legend GX/);
  });
});
