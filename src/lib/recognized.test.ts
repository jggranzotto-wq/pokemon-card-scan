import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recognizedLabel } from "./recognized";

describe("recognizedLabel", () => {
  it("shows name and collector number from the photo extract", () => {
    assert.equal(
      recognizedLabel({ name: "Charizard", collectorNumber: "4", printedTotal: "102" }),
      "Charizard 4/102",
    );
  });

  it("prefers the confirmed card number when the user taps a match", () => {
    assert.equal(
      recognizedLabel(
        { name: "Charizard", collectorNumber: "4" },
        {
          id: "base1-4",
          name: "Charizard",
          setName: "Base Set",
          setId: "base1",
          number: "4",
          printedNumber: "4/102",
          language: "English",
          images: {},
          variantHints: [],
        },
      ),
      "Charizard 4/102",
    );
  });
});
