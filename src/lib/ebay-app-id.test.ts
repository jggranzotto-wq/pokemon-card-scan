import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLikelyEbayAppId, normalizeEbayAppId, shouldShowEbaySetupOnLaunch } from "./ebay-app-id";

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

describe("shouldShowEbaySetupOnLaunch", () => {
  it("shows setup only until they save or skip", () => {
    assert.equal(shouldShowEbaySetupOnLaunch("", false), true);
    assert.equal(shouldShowEbaySetupOnLaunch("", true), false);
    assert.equal(shouldShowEbaySetupOnLaunch("MyApp-PRD-12345678", false), false);
  });
});
