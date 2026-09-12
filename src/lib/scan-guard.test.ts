import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createScanGuard } from "./scan-guard";

describe("createScanGuard", () => {
  it("ignores results from an older scan after a new photo starts", () => {
    const scans = createScanGuard();
    const first = scans.begin();
    const second = scans.begin();
    assert.equal(scans.isCurrent(first), false);
    assert.equal(scans.isCurrent(second), true);
  });
});
