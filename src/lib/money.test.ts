import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCad, formatUsd, parseMoney, quantile } from "./money";

describe("formatUsd/formatCad", () => {
  it("labels both currencies", () => {
    assert.equal(formatUsd(20), "US$20.00");
    assert.equal(formatCad(20, 1.4), "CA$28.00");
  });
});

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
