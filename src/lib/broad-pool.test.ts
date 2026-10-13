import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeSignature } from "./art-hash";
import { broadPoolCandidates, CHASE_CARD_IDS } from "./broad-pool";
import { clearImageHashMemory, writeImageHash } from "./image-hash-cache";

describe("broadPoolCandidates", () => {
  it("ranks a cached signature ahead of a different card and still includes chase cards", async () => {
    clearImageHashMemory();
    const zeros = new Array<number>(64).fill(0);
    const photo = encodeSignature("0000000000000000", "0000000000000000", zeros);
    const far = encodeSignature("ffffffffffffffff", "ffffffffffffffff", new Array<number>(64).fill(255));
    await writeImageHash("zz-close", "https://images.pokemontcg.io/zz/close.png", photo);
    await writeImageHash("zz-far", "https://images.pokemontcg.io/zz/far.png", far);

    const result = await broadPoolCandidates(photo, new Set());
    assert.equal(result.distances.get("zz-close"), 0);
    assert.equal(result.cards[0]?.id, "zz-close");
    assert.ok((result.distances.get("zz-far") ?? 0) > 0);
    assert.ok(result.cards.some((card) => card.id === "sv3-223"));
    assert.ok(CHASE_CARD_IDS.every((id) => result.cards.some((card) => card.id === id) || result.distances.has(id)));
    clearImageHashMemory();
  });
});
