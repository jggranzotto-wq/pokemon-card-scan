import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withCollectionAuth } from "./client-api";

describe("withCollectionAuth", () => {
  it("sends the settings password as a bearer token", () => {
    const headers = withCollectionAuth({ "Content-Type": "application/json" }, "shelf-secret");
    assert.equal(headers.get("Authorization"), "Bearer shelf-secret");
    assert.equal(headers.get("Content-Type"), "application/json");
  });

  it("leaves the header off when the phone has no password", () => {
    const headers = withCollectionAuth(undefined, "");
    assert.equal(headers.has("Authorization"), false);
  });

  it("does not replace an authorization header that was already set", () => {
    const headers = withCollectionAuth({ Authorization: "Bearer existing" }, "other");
    assert.equal(headers.get("Authorization"), "Bearer existing");
  });
});
