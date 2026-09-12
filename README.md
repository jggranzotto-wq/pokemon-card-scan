# Pokémon Card Scan

Mobile-first PWA for Android Chrome: take a photo of a Pokémon TCG card, identify it, and see recent eBay **sold** prices in **USD** plus an **approx CAD** conversion.

Built for raw / ungraded Pokémon unless the photo is clearly a slab. No account. No eBay seller login.

## Run it

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### On your phone (same Wi‑Fi)

1. Find your computer’s LAN IP (`ipconfig` / `ifconfig` / `ip addr`).
2. On Android Chrome, open `http://YOUR-LAN-IP:3000`.
3. Grant camera access when prompted.
4. Optional: Chrome menu → **Add to Home screen** for the standalone PWA.

`npm run dev` already binds to `0.0.0.0` so the phone can reach it.

## Identify + solds (how it works)

1. **Photo** — rear camera (`capture=environment`) or gallery. Image is compressed on the phone.
2. **Identify**
   - If `OPENAI_API_KEY` or `GEMINI_API_KEY` is set, a vision model reads name / set / number / variant / language / slab.
   - Otherwise the app uses **Tesseract OCR** in the browser, then searches **[pokemontcg.io](https://pokemontcg.io/)** (free; optional API key for higher limits).
   - You get a short candidate list to tap if the match is not obvious.
3. **Solds**
   - If `EBAY_APP_ID` is set, the server calls eBay Finding `findCompletedItems` with `SoldItemsOnly`.
   - If that key is missing (or eBay returns nothing), the solds panel uses **clearly labeled example rows**: *Example data — not live solds*.
   - A real **Open eBay sold search** link is always included.
   - TCGPlayer market (from pokemontcg.io) may appear as extra context and is labeled as **not** eBay solds.

The app never invents live-looking market numbers. Example rows say they are not real sales.

## Environment variables

Copy `.env.example` to `.env.local` and fill what you have. **All keys are optional.**

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | Best photo ID (`gpt-4o-mini` vision) |
| `GEMINI_API_KEY` | Vision fallback if OpenAI is unset |
| `POKEMONTCG_API_KEY` | Higher pokemontcg.io rate limits ([free key](https://dev.pokemontcg.io/)) |
| `EBAY_APP_ID` | Live eBay **sold** comps (Finding API App ID / Client ID). Seller credentials are **not** required. Create an app at [developer.ebay.com](https://developer.ebay.com/). |
| `USD_CAD_RATE` | Optional USD→CAD override. If unset, a public daily rate is fetched (Frankfurter) and labeled as approx. |

PriceCharting was considered as a no-key solds proxy; their pages are Cloudflare-protected, so this app does **not** scrape them.

## Scripts

```bash
npm run dev      # local server, LAN-reachable
npm run build    # production build
npm start        # serve the production build
npm test         # parser / money / sold-band unit tests
```

## Deploy

Any single Next.js host works (Vercel, Node, Docker). Set the env vars on the host. After deploy, open the HTTPS URL in Android Chrome and Add to Home screen.

## Privacy

Photos are sent only to this app’s `/api/identify` route (and to OpenAI or Gemini if you configured those keys). There is no user account and nothing is stored by the app itself.
