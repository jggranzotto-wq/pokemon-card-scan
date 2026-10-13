import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chaseCard } from "./broad-pool";
import { setsReleasedSince, warmImageHashes } from "./warm-image-hashes";
import type { PokemonCard } from "../types/card";

describe("warmImageHashes", () => {
  it("keeps sets from the last two years and drops older ones", () => {
    const kept = setsReleasedSince(
      [
        { id: "sv3", releaseDate: "2023-08-11" },
        { id: "sv8", releaseDate: "2025-01-17" },
        { id: "me1", releaseDate: "2026-03-01" },
      ],
      new Date("2024-10-13T00:00:00Z"),
    );
    assert.deepEqual(
      kept.map((set) => set.id),
      ["me1", "sv8"],
    );
  });

  it("hashes chase cards first, skips stored hashes, and stops at the new-card cap", async () => {
    const hashed: string[] = [];
    const result = await warmImageHashes({
      now: new Date("2026-10-13T00:00:00Z"),
      years: 2,
      limit: 3,
      chaseCards: [chaseCard("sv3-223"), chaseCard("base1-4")],
      listSets: async () => [
        { id: "old", releaseDate: "2020-01-01" },
        { id: "sv8", releaseDate: "2025-01-01" },
      ],
      listCards: async (setId) => [chaseCard(`${setId}-1`), chaseCard(`${setId}-2`)],
      hashCard: async (card: PokemonCard) => {
        if (card.id === "base1-4") return "skipped";
        hashed.push(card.id);
        return "hashed";
      },
    });
    assert.deepEqual(hashed, ["sv3-223", "sv8-1", "sv8-2"]);
    assert.equal(result.hashed, 3);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.sets, 1);
  });
});