import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLikelyEbayAppId, normalizeEbayAppId } from "./ebay-app-id";

describe("normalizeEbayAppId", () => {
  it("trims whitespace", () => {
    assert.equal(normalizeEbayAppId("  MyApp-PRD-abc  "), "MyApp-PRD-abc");
  });
});

describe("isLikelyEbayAppId", () => {
  it("accepts a typical App ID / Client ID", () => {
    assert.equal(isLikelyEbayAppId("Midnight-PRD-1234567890-abcdef"), true);
  });

  it("rejects empty or spaced values", () => {
    assert.equal(isLikelyEbayAppId(""), false);
    assert.equal(isLikelyEbayAppId("abc def"), false);
  });
});
