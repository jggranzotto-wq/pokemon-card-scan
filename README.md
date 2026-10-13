# TCG Card Scan

Mobile collection tracker for a Canadian eBay seller. Take a photo of a Pokémon card, or search by name, year, and set, confirm the catalog match, and save it with a thumbnail and the details you sell from: name, year, set, collector number, variant, language, rarity, condition or grade, quantity, and an optional purchase price.

Each saved card keeps **three prices**, refreshed on a daily job:

| Source | What the number is | When it is blank |
| --- | --- | --- |
| TCGPlayer market | The printing that matches the saved variant, from the free pokemontcg.io snapshot. No paid TCGPlayer key. | The catalog has no market price for that printing. Shown as **No price**, not $0. |
| Collectr | Partner API market price after you set `COLLECTR_API_KEY`. | **Not connected** until that key is set. The app does not scrape Collectr and does not invent a number. |
| eBay last sold | The most recent **sold** listing whose title matches the card. | **Not connected** until eBay grants Marketplace Insights, or a legacy Finding App ID actually returns sold rows. Active Browse listings are not used as a sold price. |

The home screen totals each source on its own, in **US$** and an estimated **CA$**, plus the change since yesterday once two days exist. CA$ is converted from US$ with a public daily FX rate (Frankfurter) and labeled as an estimate.

The Android package is still **TCG Card Scan**, `com.midnightman.cardscan`. Install the site as a PWA, or build the Capacitor wrapper. The wrapper is a static UI that calls a hosted Next.js server.

## Run it

```bash
npm install
docker compose up -d   # or any local Postgres
cp .env.example .env.local
# set DATABASE_URL=postgres://cardscan:cardscan@localhost:5432/cardscan
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On Android Chrome, use the computer's LAN IP. `npm run dev` binds to `0.0.0.0`. Then Chrome menu → **Add to Home screen**.

Scanning and public comps still work if `DATABASE_URL` is empty. Saving a card, totals, history, and eBay seller login need Postgres.

### Collection password

On localhost the API is open when `COLLECTION_PASSWORD` is unset. On any shared or public host, set `COLLECTION_PASSWORD` and enter the same value under **Settings** on the phone. The phone keeps it in `localStorage` (`card-scan.collectionToken`) and sends it as `Authorization: Bearer`.

## Daily prices

The web app stores one history row per card, per source, per seller-local day (`COLLECTION_TIMEZONE`, default `America/Toronto`). Run the refresh once a day:

```bash
npm run refresh-prices
```

That process reads `DATABASE_URL` and writes snapshots itself. It does not need the site to be up.

Or call the HTTP hook from a scheduler:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR-HOST/api/jobs/refresh-prices
```

`CRON_SECRET` is required. A manual **Refresh prices** button on the collection screen does the same job for the signed-in phone and can pass the on-device eBay App ID for that one run.

## Environment variables

Copy `.env.example` to `.env.local`. Do not commit real secrets.

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | Postgres. Required for the collection. |
| `DATABASE_SSL` | `1` on Railway's public proxy. Localhost stays off. |
| `COLLECTION_PASSWORD` | Locks the collection API. Set this before the URL is public. |
| `SESSION_SECRET` | Signs thumbnail URLs and the eBay OAuth `state`. |
| `CRON_SECRET` | Authorizes `POST /api/jobs/refresh-prices`. |
| `COLLECTION_TIMEZONE` | Day boundary for history. Default `America/Toronto`. |
| `OPENAI_API_KEY` | Optional photo ID (`gpt-4o-mini`). Used before Gemini when set. |
| `GEMINI_API_KEY` | Optional photo ID when `OPENAI_API_KEY` is unset. |
| `GEMINI_MODEL` | Gemini model id. Default `gemini-3.8-flash` (stable, accepts a photo and returns JSON). `gemini-2.0-flash` is shut down. `gemini-2.5-flash` is limited to keys that already used it. |
| `GEMINI_FALLBACK_MODEL` | Second model if the first one fails. Default `gemini-3.5-flash-lite`. Set it empty to skip the second model. |
| `POKEMONTCG_API_KEY` | Optional higher pokemontcg.io limits. [Free key](https://dev.pokemontcg.io/). |
| `USD_CAD_RATE` | Optional FX override. Otherwise Frankfurter's daily USD→CAD rate. |
| `APP_PUBLIC_URL` | Public origin of this app. Used after eBay redirects back. |
| `NEXT_PUBLIC_API_ORIGIN` | Hosted origin baked into the Android APK. |
| `COLLECTR_API_KEY` | Collectr partner key from [getcollectr.com/api](https://getcollectr.com/api). |
| `COLLECTR_API_BASE` | Host from Collectr's docs. Default `https://api.getcollectr.com`. |
| `COLLECTR_SEARCH_PATH` | Default `/v1/catalog/search`. Change if their docs use another path. |
| `COLLECTR_PRODUCT_PATH` | Default `/v1/catalog/products/{id}`. |
| `EBAY_CLIENT_ID` | eBay App ID / Client ID. |
| `EBAY_CLIENT_SECRET` | eBay Cert ID. |
| `EBAY_RUNAME` | RuName whose Accept URL is `https://YOUR-HOST/api/ebay/callback`. |
| `EBAY_ENV` | `sandbox` (default) or `production`. |
| `EBAY_MARKETPLACE_ID` | Default `EBAY_US`. Use `EBAY_CA` to list in CA$. |
| `EBAY_CATEGORY_ID` | Default `183454` (individual CCG cards on eBay US). |
| `EBAY_COUNTRY` | Inventory location country. Default `CA`. |
| `EBAY_POSTAL_CODE` | Required before a listing can publish. |
| `EBAY_CITY` / `EBAY_STATE` | Optional location lines. |
| `EBAY_PAYMENT_POLICY_ID`, `EBAY_RETURN_POLICY_ID`, `EBAY_FULFILLMENT_POLICY_ID` | Optional. Otherwise the first publish tries to create business policies. |
| `EBAY_FINDING_APP_ID` | Optional legacy Finding key if it differs from the Client ID. |

The phone can still store an eBay App ID for the scan screen's live sold search (`card-scan.ebayAppId`). The daily job cannot see the phone, so put the same App ID in `EBAY_CLIENT_ID` on the server.

Photo recognition uses `gemini-3.8-flash` unless `GEMINI_MODEL` is set. That model thinks at `low` so a card photo does not use its medium default. A 429 or 503 is retried twice with a short wait, then `GEMINI_FALLBACK_MODEL` is tried. The server logs the HTTP status and Google's error text, and never the API key. If photo recognition fails or does not return a card name, `/api/identify` reads the photo with OCR and says so in the response.

## Collectr

Collectr does not publish a price feed. An API key exists only after you register at [getcollectr.com/api](https://getcollectr.com/api). Their terms forbid scraping, crawlers, and pulling prices from the app or from anyone who scraped it.

Until `COLLECTR_API_KEY` is set, every Collectr row says **Not connected**. With a key, the adapter calls the partner host (Bearer token and `X-Api-Key`) and only keeps a product when the name, collector number, and set actually match. Set `COLLECTR_API_BASE` and the two path variables to whatever Collectr emails you if the defaults differ. A failed or unreadable response is an error, not a guessed price.

## eBay last sold

True sold history is eBay's **Marketplace Insights** API:

`GET https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search`

It needs a client-credentials token with scope `https://api.ebay.com/oauth/api_scope/buy.marketplace.insights`. eBay only enables that scope for approved applications. A normal developer key gets **403**. This app then shows **Not connected** and explains why. It does **not** fall back to the Browse API, because Browse returns active asking prices, not sold prices.

If Marketplace Insights is refused, the adapter may use the legacy **Finding** `findCompletedItems` call with `SoldItemsOnly=true` when an App ID is present. Those rows are labeled **eBay last sold · Finding API**, not Marketplace Insights. eBay has been closing Finding for new keys, so a rejected App ID stays **Not connected**.

Apply for Marketplace Insights from the eBay developer portal (Buy APIs, limited release). After approval, the same `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` start returning sold rows and the label switches to Marketplace Insights. The stored amount is the most recent matching sale. The detail line also shows the median of the matches.

## List on eBay

Listings use the Sell Inventory API (create inventory item, create offer, publish offer) with the seller's OAuth user token. Nothing posts until the review screen checkbox is on and the request body includes `confirm: true`.

1. Create a keyset at [developer.ebay.com](https://developer.ebay.com/my/keys). Sandbox first.
2. Set `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, and `EBAY_RUNAME`.
3. In the developer portal, the RuName **Accept URL** must be `https://YOUR-HOST/api/ebay/callback`. Auth accepted URL can be the same.
4. Set `EBAY_ENV=sandbox` and `EBAY_POSTAL_CODE`.
5. In the app, **Settings → Connect eBay seller** and approve the sandbox user.
6. Open a card → **List on eBay**, edit the title, price, and quantity, check the confirm box, then post.

`EBAY_ENV` defaults to sandbox. Production posts a live listing and needs `EBAY_ENV=production` plus production keys and a production RuName. Suggested price comes from TCGPlayer, then eBay last sold, then Collectr. CA$ suggestions are the US$ amount times the FX rate and are labeled as an estimate. You type the final price.

Business policies (payment, return, shipping) are created on first publish when their ids are not in the environment. eBay's sandbox often rejects a publish until those policies, the inventory location, and category condition descriptors are accepted. The app returns eBay's error and does not mark the card as listed when publish fails. A successful publish reduces the saved quantity.

Shop name in the description is **the_midnightman**. There is no automatic listing and no automatic retry.

## Deploy on Railway

Cheap shape: one web service, one Postgres, one cron.

1. New Railway project. Add the **Postgres** plugin. Copy `DATABASE_URL` onto the web service.
2. Set `DATABASE_SSL=1` if the URL is the public proxy.
3. Set `APP_PUBLIC_URL` to the web service URL, plus `COLLECTION_PASSWORD`, `SESSION_SECRET`, and `CRON_SECRET`.
4. The repo includes `railway.toml` (Nixpacks, `npm run start`, health check `/api/status`).
5. Add a second service from the same repo with start command `npm run refresh-prices` and a cron schedule of `0 12 * * *` (12:00 UTC, morning in Canada). Give it the same `DATABASE_URL` and price-source keys. It does not need to listen on a port.

The HTTP cron route is the alternative if you only want one service: schedule `POST /api/jobs/refresh-prices` with `Authorization: Bearer $CRON_SECRET`.

Do not put secrets in git. Railway variables are the right place.

## Android (PWA and Capacitor)

PWA: open the HTTPS site in Chrome and Add to Home screen. The service worker caches the shell only, not `/api`.

Capacitor wrapper (Galaxy Store / sideload), package `com.midnightman.cardscan`, launcher name **TCG Card Scan**:

```bash
npm install
export NEXT_PUBLIC_API_ORIGIN=https://YOUR-HOST
export ANDROID_HOME=/path/to/Android/sdk
npm run android:debug
```

Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

`npm run android:www` statically exports the UI into `www/` and leaves the API on the hosted origin. JDK 21 matches the Capacitor Android project. Release signing stays in `android/keystore.properties`, which is gitignored. See `android/keystore.properties.example`.

`CAPACITOR_SERVER_URL` is only for pointing the WebView at a live server during development. Do not ship a store build with it set.

## Scripts

```bash
npm run dev          # LAN-reachable Next.js
npm run build        # production build
npm start
npm test             # parsers, price adapters, listing draft, Postgres when DATABASE_URL is set
npm run refresh-prices
npm run android:sync
npm run android:debug
```

## What is still missing

- **Collectr prices** until you register and paste the key and, if needed, the base URL from their docs.
- **Marketplace Insights sold prices** until eBay approves `buy.marketplace.insights`. Finding solds work only while eBay still accepts the App ID.
- **Live eBay listings** until sandbox (or production) keys, RuName, postal code, and a completed seller consent are in place. Sandbox publish can still fail on business-policy or condition-descriptor rules; the error is shown and nothing is marked sold.
- **eBay.ca category ids** if you set `EBAY_MARKETPLACE_ID=EBAY_CA`. The default category `183454` is the US individual-card category.
- **Multi-user accounts.** This is one shop's database. The collection password is the lock.
- **Graded Collectr / eBay descriptor ids** are best-effort. A graded condition is sent in the title and item specifics; if eBay rejects the condition descriptor, the message is returned instead of a fake success.
- Photos you take are stored as a JPEG thumbnail in Postgres (600 KB max). eBay cannot fetch a password-protected thumbnail, so the listing uses the public catalog image when one exists.

## Privacy

Photos go to `/api/identify` and, only if those keys are set, to OpenAI or Gemini. Catalog data comes from pokemontcg.io and TCGdex. Price calls go to pokemontcg.io, Frankfurter, and to Collectr or eBay only when their keys are configured. Seller tokens live in Postgres, not in the repo. The on-device eBay App ID stays in `localStorage` and is sent only when you refresh or scan.
