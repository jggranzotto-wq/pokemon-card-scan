import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { variantLabel, isGradedCondition } from "./card-fields";
import { query, queryOne } from "./db";
import type { StoredCard } from "./collection-store";

const SELL_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
];

export type EbayEnvName = "sandbox" | "production";

export type EbayAppConfig = {
  environment: EbayEnvName;
  clientId: string;
  certId: string;
  ruName: string;
  marketplaceId: string;
  categoryId: string;
  country: string;
  postalCode: string;
  city: string;
  state: string;
  shippingService: string;
  currency: "USD" | "CAD";
};

export function ebayEnvironment(): EbayEnvName {
  return process.env.EBAY_ENV?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

export function ebayConfig(): EbayAppConfig {
  const environment = ebayEnvironment();
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US";
  const cad = marketplaceId === "EBAY_CA";
  return {
    environment,
    clientId: process.env.EBAY_CLIENT_ID?.trim() || "",
    certId: process.env.EBAY_CLIENT_SECRET?.trim() || process.env.EBAY_CERT_ID?.trim() || "",
    ruName: process.env.EBAY_RUNAME?.trim() || "",
    marketplaceId,
    categoryId: process.env.EBAY_CATEGORY_ID?.trim() || "183454",
    country: process.env.EBAY_COUNTRY?.trim() || "CA",
    postalCode: process.env.EBAY_POSTAL_CODE?.trim() || "",
    city: process.env.EBAY_CITY?.trim() || "",
    state: process.env.EBAY_STATE?.trim() || "",
    shippingService:
      process.env.EBAY_SHIPPING_SERVICE?.trim() || (cad ? "CA_PostRegularParcel" : "USPSGroundAdvantage"),
    currency: cad ? "CAD" : "USD",
  };
}

export function ebaySellConfigured(config = ebayConfig()): boolean {
  return Boolean(config.clientId && config.certId && config.ruName);
}

function hosts(environment: EbayEnvName) {
  if (environment === "production") {
    return {
      auth: "https://auth.ebay.com/oauth2/authorize",
      api: "https://api.ebay.com",
    };
  }
  return {
    auth: "https://auth.sandbox.ebay.com/oauth2/authorize",
    api: "https://api.sandbox.ebay.com",
  };
}

function stateSecret(): string {
  return process.env.SESSION_SECRET?.trim() || process.env.EBAY_CLIENT_SECRET?.trim() || "card-scan-oauth-state";
}

export function signOAuthState(now = Date.now()): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = now + 15 * 60 * 1000;
  const payload = `${nonce}.${exp}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string, now = Date.now()): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, exp, sig] = parts;
  if (!nonce || !exp || !sig) return false;
  const expected = createHmac("sha256", stateSecret()).update(`${nonce}.${exp}`).digest("hex");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  return Number(exp) > now;
}

export function authorizeUrl(config = ebayConfig(), state = signOAuthState()): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.ruName,
    response_type: "code",
    state,
    scope: SELL_SCOPES.join(" "),
  });
  return `${hosts(config.environment).auth}?${params.toString()}`;
}

function basicAuth(config: EbayAppConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.certId}`).toString("base64")}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: URLSearchParams, config: EbayAppConfig): Promise<TokenResponse> {
  const response = await fetch(`${hosts(config.environment).api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `eBay token request failed (${response.status}).`);
  }
  return json;
}

export async function exchangeEbayCode(code: string, config = ebayConfig()): Promise<void> {
  const json = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.ruName,
    }),
    config,
  );
  if (!json.refresh_token) throw new Error("eBay did not return a refresh token.");
  const expires = new Date(Date.now() + (json.expires_in ?? 7200) * 1000);
  await query(
    `INSERT INTO ebay_tokens (environment, access_token, refresh_token, access_expires_at, scope, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (environment) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       access_expires_at = EXCLUDED.access_expires_at,
       scope = EXCLUDED.scope,
       updated_at = now()`,
    [config.environment, json.access_token, json.refresh_token, expires.toISOString(), SELL_SCOPES.join(" ")],
  );
}

export async function ebaySellerConnected(environment = ebayEnvironment()): Promise<boolean> {
  const row = await queryOne<{ refresh_token: string }>(`SELECT refresh_token FROM ebay_tokens WHERE environment = $1`, [
    environment,
  ]);
  return Boolean(row?.refresh_token);
}

async function userAccessToken(config: EbayAppConfig): Promise<string> {
  const row = await queryOne<{ access_token: string; refresh_token: string; access_expires_at: Date }>(
    `SELECT access_token, refresh_token, access_expires_at FROM ebay_tokens WHERE environment = $1`,
    [config.environment],
  );
  if (!row) throw new Error("Connect the eBay seller account before posting a listing.");
  if (row.access_expires_at.getTime() > Date.now() + 60_000) return row.access_token;
  const json = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      scope: SELL_SCOPES.join(" "),
    }),
    config,
  );
  const expires = new Date(Date.now() + (json.expires_in ?? 7200) * 1000);
  await query(
    `UPDATE ebay_tokens SET access_token = $2, access_expires_at = $3, updated_at = now() WHERE environment = $1`,
    [config.environment, json.access_token, expires.toISOString()],
  );
  return json.access_token!;
}

export function listingTitle(card: Pick<StoredCard, "name" | "setName" | "printedNumber" | "collectorNumber" | "variant" | "language" | "condition">): string {
  const variant = variantLabel(card.variant);
  const parts = [
    "Pokemon",
    card.name,
    card.setName,
    card.printedNumber || card.collectorNumber,
    variant !== "Unknown" && variant !== "Standard / non-holo" ? variant : null,
    card.language !== "English" ? card.language : null,
    isGradedCondition(card.condition) ? card.condition : card.condition && card.condition !== "NM" ? card.condition : null,
  ].filter(Boolean) as string[];
  const title = parts.join(" ").replace(/\s+/g, " ").trim();
  return title.length <= 80 ? title : `${title.slice(0, 77).trim()}...`;
}

export function suggestedPrice(
  card: StoredCard,
  currency: "USD" | "CAD",
  usdCadRate: number,
): { amount: number | null; note: string } {
  const tcg = card.prices.find((quote) => quote.source === "tcgplayer" && quote.status === "ok");
  const ebay = card.prices.find((quote) => quote.source === "ebay_sold" && quote.status === "ok");
  const collectr = card.prices.find((quote) => quote.source === "collectr" && quote.status === "ok");
  const chosen = tcg ?? ebay ?? collectr;
  if (!chosen?.amountUsd) return { amount: null, note: "No connected price to suggest. Enter one before posting." };
  if (currency === "CAD") {
    return {
      amount: Math.round(chosen.amountUsd * usdCadRate * 100) / 100,
      note: `Suggested from ${chosen.label}, converted to CA$ at ${usdCadRate} (estimate).`,
    };
  }
  return { amount: Math.round(chosen.amountUsd * 100) / 100, note: `Suggested from ${chosen.label} in US$.` };
}

export type ListingDraft = {
  environment: EbayEnvName;
  title: string;
  description: string;
  price: number | null;
  currency: "USD" | "CAD";
  priceNote: string;
  quantity: number;
  condition: string;
  sku: string;
  imageUrls: string[];
  itemSpecifics: Record<string, string>;
  sellerConnected: boolean;
  configured: boolean;
  postalCodeSet: boolean;
  warnings: string[];
};

export function appPublicUrl(): string {
  return (process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
}

export function buildListingDraft(
  card: StoredCard,
  fx: { rate: number },
  options: { sellerConnected: boolean; configured: boolean },
): ListingDraft {
  const config = ebayConfig();
  const price = suggestedPrice(card, config.currency, fx.rate);
  const quantity = Math.max(1, Math.min(card.quantity || 1, 10));
  const imageUrls = [card.imageUrl].filter((url): url is string => Boolean(url && url.startsWith("https://")));
  const warnings: string[] = [];
  if (!options.configured) {
    warnings.push("Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RUNAME. Listings stay in sandbox unless EBAY_ENV=production.");
  }
  if (!options.sellerConnected) warnings.push("Connect the eBay seller account. Nothing is posted until you confirm a listing.");
  if (!config.postalCode) warnings.push("Set EBAY_POSTAL_CODE (inventory location) before a listing can publish.");
  if (!imageUrls.length) warnings.push("This card has no public https catalog image. eBay may reject the listing without one.");
  if (config.environment === "production") warnings.push("EBAY_ENV=production. Confirming will post a live listing.");
  else warnings.push("Sandbox mode. Confirming posts to the eBay sandbox, not the live site.");

  const graded = isGradedCondition(card.condition);
  return {
    environment: config.environment,
    title: listingTitle(card),
    description: [
      `${card.name}${card.setName ? ` from ${card.setName}` : ""}.`,
      card.printedNumber || card.collectorNumber ? `Collector number ${card.printedNumber || card.collectorNumber}.` : "",
      card.rarity ? `Rarity: ${card.rarity}.` : "",
      `Finish: ${variantLabel(card.variant)}.`,
      `Language: ${card.language}.`,
      `Condition: ${card.condition}.`,
      "Sold by the_midnightman.",
    ]
      .filter(Boolean)
      .join(" "),
    price: price.amount,
    currency: config.currency,
    priceNote: price.note,
    quantity,
    condition: card.condition,
    sku: `mm-${card.id.slice(0, 8)}-${Date.now().toString(36)}`,
    imageUrls,
    itemSpecifics: {
      Game: "Pokémon TCG",
      "Card Name": card.name,
      Set: card.setName || "Unknown",
      "Card Number": card.printedNumber || card.collectorNumber || "Unknown",
      Rarity: card.rarity || "Unknown",
      Language: card.language,
      Finish: variantLabel(card.variant),
      Graded: graded ? "Yes" : "No",
      ...(graded ? { Grade: card.condition } : { "Card Condition": card.condition }),
    },
    sellerConnected: options.sellerConnected,
    configured: options.configured,
    postalCodeSet: Boolean(config.postalCode),
    warnings,
  };
}

const UNGRADED_DESCRIPTOR: Record<string, string> = {
  NM: "400010",
  LP: "400011",
  MP: "400012",
  HP: "400013",
  DMG: "400015",
};

function conditionBody(condition: string): { condition: string; conditionDescriptors?: { name: string; values: string[] }[] } {
  if (isGradedCondition(condition)) {
    return { condition: "LIKE_NEW" };
  }
  const descriptor = UNGRADED_DESCRIPTOR[condition.toUpperCase()] ?? UNGRADED_DESCRIPTOR.NM;
  return {
    condition: "USED_VERY_GOOD",
    conditionDescriptors: [{ name: "40001", values: [descriptor] }],
  };
}

async function ebayFetch(config: EbayAppConfig, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("Content-Language", "en-CA");
  return fetch(`${hosts(config.environment).api}${path}`, { ...init, headers, cache: "no-store" });
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { errors?: { message?: string; longMessage?: string }[] };
    const message = json.errors?.[0]?.longMessage || json.errors?.[0]?.message;
    if (message) return message;
  } catch {
    // keep text
  }
  return text.slice(0, 400) || `eBay request failed (${response.status}).`;
}

async function setting(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  return row?.value ?? null;
}

async function saveSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

async function ensurePolicies(config: EbayAppConfig, token: string): Promise<{ payment: string; return: string; fulfillment: string }> {
  const fromEnv = {
    payment: process.env.EBAY_PAYMENT_POLICY_ID?.trim() || "",
    return: process.env.EBAY_RETURN_POLICY_ID?.trim() || "",
    fulfillment: process.env.EBAY_FULFILLMENT_POLICY_ID?.trim() || "",
  };
  if (fromEnv.payment && fromEnv.return && fromEnv.fulfillment) return fromEnv;

  const prefix = `ebay.${config.environment}.${config.marketplaceId}`;
  const cached = {
    payment: (await setting(`${prefix}.payment`)) || "",
    return: (await setting(`${prefix}.return`)) || "",
    fulfillment: (await setting(`${prefix}.fulfillment`)) || "",
  };
  if (cached.payment && cached.return && cached.fulfillment) return cached;

  const categoryTypes = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }];
  const paymentRes = await ebayFetch(config, token, "/sell/account/v1/payment_policy", {
    method: "POST",
    body: JSON.stringify({
      name: `Card Scan payment ${config.marketplaceId}`,
      marketplaceId: config.marketplaceId,
      categoryTypes,
      immediatePay: false,
    }),
  });
  if (!paymentRes.ok) throw new Error(await readError(paymentRes));
  const payment = (await paymentRes.json()) as { paymentPolicyId?: string };

  const returnRes = await ebayFetch(config, token, "/sell/account/v1/return_policy", {
    method: "POST",
    body: JSON.stringify({
      name: `Card Scan returns ${config.marketplaceId}`,
      marketplaceId: config.marketplaceId,
      categoryTypes,
      returnsAccepted: true,
      returnPeriod: { value: 30, unit: "DAY" },
      refundMethod: "MONEY_BACK",
      returnShippingCostPayer: "BUYER",
    }),
  });
  if (!returnRes.ok) throw new Error(await readError(returnRes));
  const returnPolicy = (await returnRes.json()) as { returnPolicyId?: string };

  const fulfillmentRes = await ebayFetch(config, token, "/sell/account/v1/fulfillment_policy", {
    method: "POST",
    body: JSON.stringify({
      name: `Card Scan shipping ${config.marketplaceId}`,
      marketplaceId: config.marketplaceId,
      categoryTypes,
      handlingTime: { value: 2, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [
            {
              sortOrder: 1,
              shippingCarrierCode: config.currency === "CAD" ? "CanadaPost" : "USPS",
              shippingServiceCode: config.shippingService,
              shippingCost: { value: config.currency === "CAD" ? "4.00" : "1.50", currency: config.currency },
              freeShipping: false,
            },
          ],
        },
      ],
    }),
  });
  if (!fulfillmentRes.ok) throw new Error(await readError(fulfillmentRes));
  const fulfillment = (await fulfillmentRes.json()) as { fulfillmentPolicyId?: string };

  const ids = {
    payment: payment.paymentPolicyId || "",
    return: returnPolicy.returnPolicyId || "",
    fulfillment: fulfillment.fulfillmentPolicyId || "",
  };
  if (!ids.payment || !ids.return || !ids.fulfillment) throw new Error("eBay did not return business policy ids.");
  await saveSetting(`${prefix}.payment`, ids.payment);
  await saveSetting(`${prefix}.return`, ids.return);
  await saveSetting(`${prefix}.fulfillment`, ids.fulfillment);
  return ids;
}

async function ensureLocation(config: EbayAppConfig, token: string): Promise<string> {
  const key = process.env.EBAY_MERCHANT_LOCATION_KEY?.trim() || "the-midnightman";
  if (!config.postalCode) throw new Error("Set EBAY_POSTAL_CODE before publishing. eBay needs an inventory location.");
  const response = await ebayFetch(config, token, `/sell/inventory/v1/location/${encodeURIComponent(key)}`, {
    method: "POST",
    body: JSON.stringify({
      name: "the midnightman",
      merchantLocationStatus: "ENABLED",
      locationTypes: ["WAREHOUSE"],
      location: {
        address: {
          country: config.country,
          postalCode: config.postalCode,
          ...(config.city ? { city: config.city } : {}),
          ...(config.state ? { stateOrProvince: config.state } : {}),
        },
      },
    }),
  });
  if (!response.ok && response.status !== 409) {
    const message = await readError(response);
    if (!/already exists/i.test(message)) throw new Error(message);
  }
  return key;
}

export type PublishInput = {
  card: StoredCard;
  title: string;
  description: string;
  price: number;
  currency: "USD" | "CAD";
  quantity: number;
};

export type PublishResult = {
  listingId: string;
  offerId: string;
  sku: string;
  environment: EbayEnvName;
  url: string | null;
};

export async function publishListing(input: PublishInput, config = ebayConfig()): Promise<PublishResult> {
  if (!ebaySellConfigured(config)) {
    throw new Error("eBay selling is not configured. Add the client id, cert id, and RuName.");
  }
  if (input.quantity < 1 || input.quantity > input.card.quantity) {
    throw new Error("Listing quantity has to be at least 1 and no more than the quantity you own.");
  }
  if (!Number.isFinite(input.price) || input.price <= 0) throw new Error("Enter a price greater than zero.");
  const title = input.title.trim();
  if (title.length < 3 || title.length > 80) throw new Error("The title must be 3 to 80 characters.");

  const token = await userAccessToken(config);
  const sku = `mm-${input.card.id.slice(0, 8)}-${Date.now().toString(36)}`;
  const imageUrls = input.card.imageUrl?.startsWith("https://") ? [input.card.imageUrl] : [];
  const inventory = await ebayFetch(config, token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: "PUT",
    headers: { "Content-Language": "en-CA" },
    body: JSON.stringify({
      availability: { shipToLocationAvailability: { quantity: input.quantity } },
      ...conditionBody(input.card.condition),
      product: {
        title,
        description: input.description.trim() || title,
        ...(imageUrls.length ? { imageUrls } : {}),
        aspects: Object.fromEntries(
          Object.entries({
            Game: ["Pokémon TCG"],
            "Card Name": [input.card.name],
            Set: [input.card.setName || "Unknown"],
            "Card Number": [input.card.printedNumber || input.card.collectorNumber || "Unknown"],
            Rarity: [input.card.rarity || "Unknown"],
            Language: [input.card.language],
            Finish: [variantLabel(input.card.variant)],
            Graded: [isGradedCondition(input.card.condition) ? "Yes" : "No"],
          }).filter((entry) => entry[1][0]),
        ),
      },
    }),
  });
  if (!inventory.ok) throw new Error(await readError(inventory));

  const locationKey = await ensureLocation(config, token);
  const policies = await ensurePolicies(config, token);
  const offerRes = await ebayFetch(config, token, "/sell/inventory/v1/offer", {
    method: "POST",
    body: JSON.stringify({
      sku,
      marketplaceId: config.marketplaceId,
      format: "FIXED_PRICE",
      availableQuantity: input.quantity,
      categoryId: config.categoryId,
      listingDescription: input.description.trim() || title,
      listingPolicies: {
        paymentPolicyId: policies.payment,
        returnPolicyId: policies.return,
        fulfillmentPolicyId: policies.fulfillment,
      },
      merchantLocationKey: locationKey,
      pricingSummary: { price: { value: input.price.toFixed(2), currency: input.currency } },
    }),
  });
  if (!offerRes.ok) throw new Error(await readError(offerRes));
  const offer = (await offerRes.json()) as { offerId?: string };
  if (!offer.offerId) throw new Error("eBay did not return an offer id.");

  const publishRes = await ebayFetch(
    config,
    token,
    `/sell/inventory/v1/offer/${encodeURIComponent(offer.offerId)}/publish`,
    { method: "POST", body: "{}" },
  );
  if (!publishRes.ok) throw new Error(await readError(publishRes));
  const published = (await publishRes.json()) as { listingId?: string };
  const listingId = published.listingId || "";
  const host = config.environment === "production" ? "https://www.ebay.com/itm/" : "https://www.sandbox.ebay.com/itm/";
  await query(
    `INSERT INTO ebay_listings (card_id, environment, status, sku, offer_id, listing_id, title, price, currency, quantity, posted_at)
     VALUES ($1, $2, 'posted', $3, $4, $5, $6, $7, $8, $9, now())`,
    [input.card.id, config.environment, sku, offer.offerId, listingId, title, input.price, input.currency, input.quantity],
  );
  return {
    listingId,
    offerId: offer.offerId,
    sku,
    environment: config.environment,
    url: listingId ? `${host}${listingId}` : null,
  };
}
