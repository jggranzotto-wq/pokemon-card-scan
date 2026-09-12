# Pokémon Card Scan

Mobile-first PWA for Android Chrome: take a photo of a Pokémon TCG card, identify **name, collector number, set, year, and rarity** from the image plus official catalog data, then show **public market comparables** in **USD** plus an **approx CAD** conversion.

Built for raw / ungraded Pokémon unless the photo is clearly a slab. No user account. No eBay login. An eBay Developer **App ID / Client ID** is optional if you want live eBay sold listings.

## Run it

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### On your phone (same Wi‑Fi)

1. Find your computer’s LAN IP (`ipconfig` / `ifconfig` / `ip addr`).
2. On Android Chrome, open `http://YOUR-LAN-IP:3000`.
3. On first launch, paste your eBay App ID and tap **Save**, or tap **Scan without eBay for now**.
4. Grant camera access when prompted.
5. Optional: Chrome menu → **Add to Home screen**.

`npm run dev` already binds to `0.0.0.0` so the phone can reach it.

## eBay App ID (first screen)

The first screen asks for an App ID. You can **Save** it, or tap **Scan without eBay for now** to open the camera immediately.

1. Open [developer.ebay.com](https://developer.ebay.com/) and sign in.
2. Open [Application Keys](https://developer.ebay.com/my/keys).
3. Copy the Production **App ID (Client ID)** — not Cert ID, not your seller password.
4. Paste it and tap Save when eBay approves it (often the next business day).

Skip remembers that you left setup, so the next launch goes to scan. Identification and public comps work with no App ID and no eBay login. After you save an App ID, live eBay sold listings are added when Finding accepts the key.

The App ID is stored only in this browser’s `localStorage` (`card-scan.ebayAppId`). Nothing is committed to the repo. Change or clear it later with the settings gear or the footer links. It does **not** fall back to a hardcoded key or fake live solds.

## Identify + solds

1. **Photo** — rear camera (`capture=environment`) or gallery. The file name is ignored (`card.jpg`).
2. **Identify** — the photo is sent to `/api/identify`. Vision runs if those keys exist; otherwise the server reads the image with OCR (English and Japanese). Japanese names map to the English catalog name. Garbage OCR is never shown as the name. Missing catalog fields say **Unknown**. This step does not need an App ID.
3. **Comparables** — always, after a successful ID. Keywords are the richer identity: **name + collector number + set**. Public TCGPlayer market prices come from pokemontcg.io (no user key). PriceCharting and eBay sold-search links are offered so you can tap through. Live eBay sold listings run only when an App ID is saved and Finding accepts it. Missing or unofficial cards say so instead of inventing a price. Each new photo starts a new scan and refreshes every identity field.

## Optional environment variables

Copy `.env.example` to `.env.local` if you want better photo ID. **None of these are required** for the app to run, and **eBay solds use the on-device App ID**, not a server env secret.

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | Best photo ID (`gpt-4o-mini` vision) |
| `GEMINI_API_KEY` | Vision fallback if OpenAI is unset |
| `POKEMONTCG_API_KEY` | Higher pokemontcg.io rate limits ([free key](https://dev.pokemontcg.io/)) |
| `USD_CAD_RATE` | Optional USD→CAD override. If unset, a public daily rate is fetched (Frankfurter) and labeled as approx. |

## Scripts

```bash
npm run dev      # local server, LAN-reachable
npm run build    # production build
npm start        # serve the production build
npm test         # parser / money / sold-band unit tests
```

## Deploy

Any single Next.js host works (Vercel, Node, Docker). After deploy, open the HTTPS URL in Android Chrome, skip or paste an App ID, then Add to Home screen.

## Privacy

Photos go to this app’s `/api/identify` route (and to OpenAI or Gemini only if those keys are configured on the server). Public comps use pokemontcg.io / TCGdex. Your eBay App ID, if you add one, stays on the phone and is sent only to `/api/solds` so the server can call eBay Finding. There is no user account and no eBay login.
