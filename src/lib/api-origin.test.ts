import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiUrl } from "./api-origin";

describe("apiUrl", () => {
  it("keeps same-origin paths when no API origin is set", () => {
    assert.equal(apiUrl("/api/status"), "/api/status");
    assert.equal(apiUrl("api/solds"), "/api/solds");
  });
});
