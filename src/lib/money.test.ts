import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMoney, quantile } from "./money";

describe("parseMoney", () => {
  it("reads a dollar string", () => {
    assert.equal(parseMoney("$12.50"), 12.5);
  });
});

describe("quantile", () => {
  it("returns the middle value of a sorted list", () => {
    assert.equal(quantile([1, 2, 3], 0.5), 2);
  });
});
