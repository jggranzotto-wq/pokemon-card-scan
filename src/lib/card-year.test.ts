import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { yearFromCopyrightText, yearFromReleaseDate } from "./card-year";

describe("yearFromReleaseDate", () => {
  it("reads pokemontcg.io dates", () => {
    assert.equal(yearFromReleaseDate("1999/01/09"), 1999);
  });

  it("reads TCGdex dates", () => {
    assert.equal(yearFromReleaseDate("2023-06-09"), 2023);
  });

  it("does not invent a year", () => {
    assert.equal(yearFromReleaseDate(""), null);
    assert.equal(yearFromReleaseDate("soon"), null);
  });
});

describe("yearFromCopyrightText", () => {
  it("reads a printed copyright year", () => {
    assert.equal(yearFromCopyrightText("©1999 Nintendo / Creatures / GAME FREAK"), 1999);
  });

  it("ignores HP and collector numbers", () => {
    assert.equal(yearFromCopyrightText("Charizard\nHP 120\n4/102"), null);
  });
});
