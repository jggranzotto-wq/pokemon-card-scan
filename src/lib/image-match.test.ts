import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { differenceHash } from "./dhash";
import { catalogHashDistances, type ImageHashCache } from "./image-match";
import type { PokemonCard } from "../types/card";

async function art(seed: number): Promise<Buffer> {
  const data = Buffer.alloc(120 * 160 * 3);
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 120; x++) {
      const i = (y * 120 + x) * 3;
      data[i] = (x * seed) % 255;
      data[i + 1] = (y * 3) % 255;
      data[i + 2] = (x + y * seed) % 255;
    }
  }
  return sharp(data, { raw: { width: 120, height: 160, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

function card(id: string): PokemonCard {
  return {
    id,
    name: id,
    setName: "Base",
    setId: "base1",
    number: "4",
    printedNumber: "4/102",
    language: "English",
    images: { small: `https://images.pokemontcg.io/${id}.png` },
    variantHints: [],
  };
}

describe("catalogHashDistances", () => {
  it("ranks the catalog image that matches the photo and reuses a cached hash", async () => {
    const match = await art(4);
    const other = await art(9);
    const fetched: string[] = [];
    const stored = new Map<string, string>();
    const cache: ImageHashCache = {
      async get(cardId) {
        return stored.get(cardId) ?? null;
      },
      async set(cardId, _url, hash) {
        stored.set(cardId, hash);
      },
    };
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const href = String(url);
      fetched.push(href);
      const bytes = href.includes("base1-4") ? match : other;
      return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as typeof fetch;

    const first = await catalogHashDistances(match, [card("base1-4"), card("sv8-223")], {
      fetchImpl,
      cache,
    });
    assert.ok((first.get("base1-4") ?? 64) < (first.get("sv8-223") ?? 0));
    assert.equal(fetched.length, 2);

    fetched.length = 0;
    const second = await catalogHashDistances(match, [card("base1-4")], { fetchImpl, cache });
    assert.equal(fetched.length, 0);
    assert.equal(second.get("base1-4"), first.get("base1-4"));
    assert.equal(stored.get("base1-4"), await differenceHash(match));
  });
});
