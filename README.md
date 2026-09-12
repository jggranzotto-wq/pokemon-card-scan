# Pokémon Card Scan

Mobile-first PWA for Android Chrome: take a photo of a Pokémon TCG card, identify **name, collector number, set, year, and rarity** from the image plus official catalog data, then show recent eBay **sold** prices in **USD** plus an **approx CAD** conversion.

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

Skip remembers that you left setup, so the next launch goes to scan. Identification still works with no App ID. The solds panel then says **Add your eBay App ID to see sold prices** and does **not** call eBay. After you save an App ID, solds run as usual.

The App ID is stored only in this browser’s `localStorage` (`card-scan.ebayAppId`). Nothing is committed to the repo. Change or clear it later with the settings gear or the footer links. It does **not** fall back to a hardcoded key or fake live solds.

## Identify + solds

1. **Photo** — rear camera (`capture=environment`) or gallery. The file name is ignored (`card.jpg`).
2. **Identify** — the photo is sent to `/api/identify`. Vision runs if those keys exist; otherwise the server reads the image with OCR (English and Japanese). Japanese names map to the English catalog name. Garbage OCR is never shown as the name. Missing catalog fields say **Unknown**. This step does not need an App ID.
3. **Solds** — only after an App ID is saved. Keywords are the richer identity: **name + collector number + set**. Each new photo starts a new scan and refreshes every identity field.

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
