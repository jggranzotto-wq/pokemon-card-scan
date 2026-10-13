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
    await writeImageHash("sv3-223", "https://images.pokemontcg.io/sv3/223.png", photo, {
      id: "sv3-223",
      name: "Charizard ex",
      setName: "Obsidian Flames",
      setId: "sv3",
      number: "223",
      printedNumber: "223/197",
      rarity: "Special Illustration Rare",
      language: "English",
      images: {
        small: "https://images.pokemontcg.io/sv3/223.png",
        large: "https://images.pokemontcg.io/sv3/223_hires.png",
      },
      variantHints: ["Special Illustration Rare"],
      tcgplayer: { marketUsd: 42 },
    });

    const result = await broadPoolCandidates(photo, new Set());
    const ex = result.cards.find((card) => card.id === "sv3-223");
    assert.equal(ex?.name, "Charizard ex");
    assert.equal(ex?.setName, "Obsidian Flames");
    assert.equal(ex?.printedNumber, "223/197");
    assert.equal(ex?.rarity, "Special Illustration Rare");
    assert.equal(ex?.images.large, "https://images.pokemontcg.io/sv3/223_hires.png");
    assert.equal(ex?.tcgplayer?.marketUsd, 42);
    assert.equal(result.distances.get("zz-close"), 0);
    assert.equal(result.distances.get("sv3-223"), 0);
    assert.equal(result.cards.find((card) => card.id === "zz-close")?.name, "zz-close");
    assert.ok((result.distances.get("zz-far") ?? 0) > 0);
    assert.ok(result.cards.some((card) => card.id === "sv3-223"));
    assert.ok(CHASE_CARD_IDS.every((id) => result.cards.some((card) => card.id === id) || result.distances.has(id)));
    clearImageHashMemory();
  });
});
