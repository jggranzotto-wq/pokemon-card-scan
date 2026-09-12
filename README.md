# Pokémon Card Scan

Mobile-first PWA for Android Chrome: take a photo of a Pokémon TCG card, identify the **name and collector number from the image**, then show recent eBay **sold** prices in **USD** plus an **approx CAD** conversion.

Built for raw / ungraded Pokémon unless the photo is clearly a slab. No user account. You paste your own eBay Developer **App ID / Client ID** on the first screen.

## Run it

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### On your phone (same Wi‑Fi)

1. Find your computer’s LAN IP (`ipconfig` / `ifconfig` / `ip addr`).
2. On Android Chrome, open `http://YOUR-LAN-IP:3000`.
3. On first launch, paste your eBay App ID and tap **Save**.
4. Grant camera access when prompted.
5. Optional: Chrome menu → **Add to Home screen**.

`npm run dev` already binds to `0.0.0.0` so the phone can reach it.

## eBay App ID (first screen)

The app asks for an App ID **before** camera/upload.

1. Open [developer.ebay.com](https://developer.ebay.com/) and sign in.
2. Open [Application Keys](https://developer.ebay.com/my/keys).
3. Copy the Production **App ID (Client ID)** — not Cert ID, not your seller password.
4. Paste it and tap Save.

It is stored only in this browser’s `localStorage` (`card-scan.ebayAppId`). Nothing is committed to the repo. Change or clear it later with the settings gear or the footer links.

The App ID is sent with each solds request to the Finding API (`findCompletedItems`, sold items only). If it is missing or eBay rejects it, the app shows an error and returns you to the App ID field. It does **not** fall back to a hardcoded key or fake live solds.

## Identify + solds

1. **Photo** — rear camera (`capture=environment`) or gallery. The file name is ignored (`card.jpg`).
2. **Identify** — vision (if `OPENAI_API_KEY` / `GEMINI_API_KEY` exist) or Tesseract OCR on the image, then pokemontcg.io / TCGdex. The screen shows **Recognized: {name} {number}** before solds load.
3. **Solds** — eBay search keywords are that recognized **name + collector/set number** (plus set when known). Each new photo starts a new scan and does not reuse the previous card’s solds.

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

Any single Next.js host works (Vercel, Node, Docker). After deploy, open the HTTPS URL in Android Chrome, paste your App ID, then Add to Home screen.

## Privacy

Photos go to this app’s `/api/identify` route (and to OpenAI or Gemini only if those keys are configured on the server). Your eBay App ID stays on the phone and is sent only to `/api/solds` so the server can call eBay. There is no user account.
