import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chaseCard } from "./broad-pool";
import { identifyOcrPhoto } from "./ocr-identify";
import { OCR_GUIDANCE_MESSAGE, OCR_UNCLEAR_MESSAGE } from "./ocr-match";
import { VISION_QUOTA_NOTE } from "./vision-messages";
import type { PokemonCard } from "../types/card";

function card(id: string, name: string, number: string, printedNumber: string): PokemonCard {
  return {
    id,
    name,
    setName: "Base Set",
    setId: "base1",
    number,
    printedNumber,
    language: "English",
    images: { small: `https://images.pokemontcg.io/${id}.png` },
    variantHints: [],
  };
}

const charizard = card("base1-4", "Charizard", "4", "4/102");
const other = card("base4-4", "Charizard", "4", "4/130");

describe("identifyOcrPhoto", () => {
  it("passes the quota notice through and auto-selects a strong image match", async () => {
    const result = await identifyOcrPhoto({
      extracted: { name: "Charizard", collectorNumber: "4", printedTotal: "102" },
      photo: Buffer.from("photo"),
      notice: VISION_QUOTA_NOTE,
      visionAvailable: true,
      lookup: async () => [charizard, other],
      distancesFor: async () =>
        new Map([
          ["base1-4", 6],
          ["base4-4", 20],
        ]),
    });
    assert.equal(result.method, "ocr");
    assert.equal(result.notice, VISION_QUOTA_NOTE);
    assert.equal(result.autoSelectedId, "base1-4");
    assert.equal(result.visionAvailable, true);
  });

  it("asks for a name search when a text-only read lacks both a name and a number", async () => {
    const result = await identifyOcrPhoto({
      extracted: { name: "Charizard" },
      lookup: async () => [charizard],
    });
    assert.deepEqual(result.candidates, []);
    assert.equal(result.autoSelectedId, undefined);
    assert.equal(result.message, OCR_UNCLEAR_MESSAGE);
  });

  it("hashes ex and V printings before plain names", async () => {
    const ex = card("sv3-223", "Charizard ex", "223", "223/197");
    const plain = card("base1-4", "Charizard", "4", "4/102");
    const seen: string[] = [];
    let broad = false;
    await identifyOcrPhoto({
      extracted: { name: "Charizard", collectorNumber: "7", confidence: 0.95 },
      photo: Buffer.from("photo"),
      lookup: async () => [plain, ex],
      loadBroadCards: async () => {
        broad = true;
        return [];
      },
      distancesFor: async (_photo, cards) => {
        seen.push(...cards.map((row) => row.id));
        return new Map(cards.map((row) => [row.id, 30]));
      },
    });
    assert.deepEqual(seen.slice(0, 2), ["sv3-223", "base1-4"]);
    assert.equal(broad, true);
  });

  it("overrides a wrong OCR name when the broad image score is stronger", async () => {
    const infernape = card("sv4-1", "Infernape", "1", "1/197");
    const ex = card("sv3-223", "Charizard ex", "223", "223/197");
    let broad = false;
    const result = await identifyOcrPhoto({
      extracted: { name: "Infernape", confidence: 0.92 },
      photo: Buffer.from("photo"),
      lookup: async () => [infernape],
      loadBroadCards: async () => {
        broad = true;
        return [ex];
      },
      distancesFor: async (_photo, cards) => new Map(cards.map((row) => [row.id, row.id === "sv3-223" ? 16 : 41])),
    });
    assert.equal(broad, true);
    assert.equal(result.candidates[0]?.id, "sv3-223");
    assert.equal(result.autoSelectedId, "sv3-223");
    assert.ok((result.candidates[0]?.imageScore ?? 0) > (result.candidates[1]?.imageScore ?? 0));
  });

  it("fills in name, set, number, rarity, and price for a cached hash stub", async () => {
    const full = {
      ...card("sv3-223", "Charizard ex", "223", "223/197"),
      setName: "Obsidian Flames",
      setId: "sv3",
      rarity: "Special Illustration Rare",
      images: {
        small: "https://images.pokemontcg.io/sv3/223.png",
        large: "https://images.pokemontcg.io/sv3/223_hires.png",
      },
      tcgplayer: { marketUsd: 42 },
    };
    const result = await identifyOcrPhoto({
      extracted: { name: "Infernape", confidence: 0.2 },
      photo: Buffer.from("photo"),
      lookup: async () => [],
      loadBroadCards: async () => [chaseCard("sv3-223")],
      hydrate: async (id) => (id === "sv3-223" ? full : null),
      distancesFor: async (_photo, cards) => new Map(cards.map((row) => [row.id, 12])),
    });
    assert.equal(result.candidates[0]?.name, "Charizard ex");
    assert.equal(result.candidates[0]?.setName, "Obsidian Flames");
    assert.equal(result.candidates[0]?.printedNumber, "223/197");
    assert.equal(result.candidates[0]?.rarity, "Special Illustration Rare");
    assert.equal(result.candidates[0]?.images.large, "https://images.pokemontcg.io/sv3/223_hires.png");
    assert.equal(result.candidates[0]?.tcgplayer?.marketUsd, 42);
    assert.equal(result.autoSelectedId, "sv3-223");
  });

  it("returns guidance when the image match is too close to auto-select", async () => {
    const result = await identifyOcrPhoto({
      extracted: { name: "Charizard", collectorNumber: "4", printedTotal: "102", confidence: 0.95 },
      photo: Buffer.from("photo"),
      lookup: async () => [charizard, other],
      distancesFor: async () =>
        new Map([
          ["base1-4", 8],
          ["base4-4", 10],
        ]),
    });
    assert.equal(result.autoSelectedId, undefined);
    assert.equal(result.message, OCR_GUIDANCE_MESSAGE);
    assert.equal(result.candidates[0]?.id, "base1-4");
  });
});
