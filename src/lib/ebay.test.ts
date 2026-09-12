import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EbayAppIdError, fetchEbaySolds } from "./ebay";

describe("fetchEbaySolds", () => {
  it("refuses to call eBay without an App ID", async () => {
    await assert.rejects(() => fetchEbaySolds("Pikachu 58 Pokemon", ""), (err: unknown) => {
      assert.ok(err instanceof EbayAppIdError);
      assert.equal(err.code, "MISSING_APP_ID");
      return true;
    });
  });
});
