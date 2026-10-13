import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVariant } from "./card-fields";
import { chooseCollectrProduct, parseCollectrProducts, quoteCollectr } from "./prices/collectr";
import { quoteTcgplayer } from "./prices/tcgplayer";
import { parseInsightSales, quoteEbaySold, selectLastSold } from "./prices/ebay-sold";
import { pickVariantPrice } from "./prices/printing";
import { changeSince, rollupSource } from "./prices/totals";
import { listingTitle, signOAuthState, suggestedPrice, verifyOAuthState } from "./ebay-sell";
import { passwordMatches } from "./collection-auth";
import type { StoredCard } from "./collection-store";
import { closePool, hasDatabase } from "./db";
import { createCard, deleteCard, getCard, recomputeTotals, saveQuotes } from "./collection-store";
import { collectionDay, previousDay } from "./day";
import { query } from "./db";

test("a catalog outage is an error instead of a missing card", async () => {
  const quote = await quoteTcgplayer(
    { catalogId: "base1-4", name: "Charizard", variant: "holo" },
    { env: {} as NodeJS.ProcessEnv, fetch: async () => new Response("unavailable", { status: 500 }) },
  );
  assert.equal(quote.status, "error");
  assert.equal(quote.amountUsd, null);
  assert.match(quote.detail || "", /500/);
});

test("variant price does not borrow a different printing", () => {
  const prices = {
    holofoil: { market: 40 },
    reverseHolofoil: { market: 8 },
    normal: { market: 2 },
  };
  assert.equal(pickVariantPrice(prices, "reverse")?.market, 8);
  assert.equal(pickVariantPrice(prices, "reverse holo")?.key, "reverseHolofoil");
  assert.equal(pickVariantPrice(prices, "standard")?.market, 2);
  assert.equal(pickVariantPrice({ holofoil: { market: 40 } }, "standard"), null);
  assert.equal(pickVariantPrice(prices, "unknown")?.market, 40);
  assert.equal(normalizeVariant("1st Edition Holofoil"), "1st edition holo");
});

test("missing prices roll up as not connected, never zero", () => {
  const total = rollupSource("collectr", [
    { quantity: 2, status: "not_connected", amountUsd: null },
    { quantity: 1, status: "not_connected", amountUsd: null },
  ]);
  assert.equal(total.totalUsd, null);
  assert.equal(total.status, "not_connected");

  const partial = rollupSource("tcgplayer", [
    { quantity: 2, status: "ok", amountUsd: 10 },
    { quantity: 1, status: "unavailable", amountUsd: null },
  ]);
  assert.equal(partial.totalUsd, 20);
  assert.equal(partial.status, "partial");
  assert.equal(partial.pricedCount, 1);
  assert.equal(changeSince(20, null), null);
  assert.equal(changeSince(20, 15), 5);
});

test("collectr stays disconnected without a key and rejects a weak match", async () => {
  const closed = await quoteCollectr({ name: "Charizard" }, { env: {} as NodeJS.ProcessEnv });
  assert.equal(closed.status, "not_connected");
  assert.equal(closed.amountUsd, null);

  const products = parseCollectrProducts({
    products: [
      { id: "1", name: "Blastoise", set: "Base Set", card_number: "2", market_price: 90 },
      { id: "2", name: "Charizard", set: "Base Set", card_number: "4", market_price: 400 },
    ],
  });
  assert.equal(chooseCollectrProduct(products, { name: "Charizard", number: "4", setName: "Base Set" })?.id, "2");
  assert.equal(chooseCollectrProduct(products, { name: "Pikachu", number: "58", setName: "Base Set" }), null);

  const calls: string[] = [];
  const quoted = await quoteCollectr(
    { name: "Charizard", number: "4", setName: "Base Set", condition: "NM" },
    {
      env: { COLLECTR_API_KEY: "test-key", COLLECTR_API_BASE: "https://collectr.example" } as NodeJS.ProcessEnv,
      fetch: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/search")) {
          return new Response(JSON.stringify({ products: [{ id: "2", name: "Charizard", set: "Base Set", card_number: "4", market_price: 1 }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ market_price: 420 }), { status: 200 });
      },
    },
  );
  assert.equal(quoted.status, "ok");
  assert.equal(quoted.amountUsd, 420);
  assert.equal(quoted.externalId, "2");
  assert.equal(calls.some((url) => url.startsWith("https://app.getcollectr.com")), false);
});

test("ebay sold uses insights when approved and stays blank otherwise", async () => {
  const closed = await quoteEbaySold({ name: "Charizard" }, { env: {} as NodeJS.ProcessEnv, fetch: async () => { throw new Error("network"); } });
  assert.equal(closed.status, "not_connected");
  assert.equal(closed.amountUsd, null);
  assert.match(closed.detail || "", /Marketplace Insights/);

  const quoted = await quoteEbaySold(
    { name: "Charizard", setName: "Base Set", printedNumber: "4/102", condition: "NM" },
    {
      env: { EBAY_CLIENT_ID: "app", EBAY_CLIENT_SECRET: "cert" } as NodeJS.ProcessEnv,
      usdCadRate: 1.4,
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/oauth2/token")) {
          return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            itemSales: [
              { title: "Charizard Base Set 4/102 PSA 10", lastSoldPrice: { value: "900", currency: "USD" }, lastSoldDate: "2026-10-01T00:00:00.000Z" },
              { title: "Pokemon Charizard Base Set 4/102 Holo", lastSoldPrice: { value: "300", currency: "USD" }, lastSoldDate: "2026-10-12T00:00:00.000Z" },
              { title: "Unrelated lot", lastSoldPrice: { value: "5", currency: "USD" }, lastSoldDate: "2026-10-13T00:00:00.000Z" },
            ],
          }),
          { status: 200 },
        );
      },
    },
  );
  assert.equal(quoted.status, "ok");
  assert.equal(quoted.amountUsd, 300);
  assert.match(quoted.label, /Marketplace Insights/);

  const denied = await quoteEbaySold(
    { name: "Charizard" },
    {
      env: { EBAY_CLIENT_ID: "app", EBAY_CLIENT_SECRET: "cert" } as NodeJS.ProcessEnv,
      skipFinding: true,
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/oauth2/token")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
        return new Response(JSON.stringify({ errors: [{ message: "Insufficient permissions" }] }), { status: 403 });
      },
    },
  );
  assert.equal(denied.status, "not_connected");
  assert.equal(denied.amountUsd, null);

  const parsed = parseInsightSales({ itemSales: [] });
  assert.deepEqual(parsed, []);
  assert.equal(selectLastSold([], { name: "Charizard" }), null);
});

test("listing title is capped and the price suggestion names its source", () => {
  const card = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Charizard",
    setName: "Base Set",
    printedNumber: "4/102",
    collectorNumber: "4",
    variant: "holo",
    language: "English",
    condition: "NM",
    quantity: 1,
    prices: [
      { source: "tcgplayer", status: "ok", amountUsd: 120, label: "TCGPlayer market · Holofoil", detail: null, observedAt: null },
      { source: "collectr", status: "not_connected", amountUsd: null, label: "Not connected", detail: null, observedAt: null },
      { source: "ebay_sold", status: "not_connected", amountUsd: null, label: "Not connected", detail: null, observedAt: null },
    ],
  } as StoredCard;
  assert.ok(listingTitle({ ...card, name: "X".repeat(90) }).length <= 80);
  assert.match(listingTitle(card), /Charizard/);
  const suggestion = suggestedPrice(card, "CAD", 1.25);
  assert.equal(suggestion.amount, 150);
  assert.match(suggestion.note, /estimate/);
  const state = signOAuthState();
  assert.equal(verifyOAuthState(state), true);
  assert.equal(verifyOAuthState("nope"), false);
  assert.equal(passwordMatches("secret", "secret"), true);
  assert.equal(passwordMatches("secret", "other"), false);
});

test("postgres stores a thumbnail, a null missing price, and a day-over-day total", async (t) => {
  if (!hasDatabase()) {
    t.skip();
    return;
  }
  await query(`DELETE FROM collection_cards WHERE name = $1`, ["Tracker Test Charizard"]);
  const id = await createCard(
    {
      name: "Tracker Test Charizard",
      setName: "Base Set",
      setYear: 1999,
      collectorNumber: "4",
      printedNumber: "4/102",
      variant: "holo",
      language: "English",
      rarity: "Rare Holo",
      condition: "NM",
      quantity: 2,
      purchasePrice: 15,
      purchaseCurrency: "CAD",
    },
    { bytes: Buffer.from("not-a-real-image-but-long-enough-for-a-row"), mime: "image/jpeg" },
  );
  t.after(async () => {
    await query(`DELETE FROM collection_totals WHERE day = $1`, [previousDay(collectionDay())]);
    await deleteCard(id);
    await closePool();
  });

  const day = collectionDay();
  await saveQuotes(id, day, [
    { source: "tcgplayer", status: "ok", amountUsd: 10, label: "TCGPlayer market", detail: null },
    { source: "collectr", status: "not_connected", amountUsd: null, label: "Not connected", detail: "Connect Collectr" },
    { source: "ebay_sold", status: "unavailable", amountUsd: null, label: "No matching eBay sale", detail: null },
  ]);
  await query(
    `INSERT INTO collection_totals (source, day, total_usd, status, priced_count, card_count)
     VALUES ('tcgplayer', $1, 15, 'ok', 1, 1)
     ON CONFLICT (source, day) DO UPDATE SET total_usd = 15`,
    [previousDay(day)],
  );
  const totals = await recomputeTotals(day);
  const tcg = totals.find((total) => total.source === "tcgplayer");
  const collectr = totals.find((total) => total.source === "collectr");
  assert.equal(collectr?.status, "not_connected");
  assert.equal(collectr?.totalUsd, null);
  if (tcg?.cardCount === 1) {
    assert.equal(tcg.totalUsd, 20);
    assert.equal(tcg.changeUsd, 5);
  }

  const stored = await getCard(id);
  assert.equal(stored?.quantity, 2);
  assert.equal(stored?.purchasePrice, 15);
  assert.match(stored?.thumbnailUrl || "", /\/api\/collection\//);
  const tcgQuote = stored?.prices.find((price) => price.source === "tcgplayer");
  assert.equal(tcgQuote?.amountUsd, 10);
  assert.equal(stored?.prices.find((price) => price.source === "collectr")?.amountUsd, null);
});
