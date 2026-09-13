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
2. **Or find by name** — type the Pokémon / card name, pick a catalog **year** and **set**, optionally a collector number, then **Find this card**. No photo required. Years and set names come from pokemontcg.io / TCGdex. If several printings match, tap the one on your card.
3. **Identify** — the photo is sent to `/api/identify`. Vision runs if those keys exist; otherwise the server reads the image with OCR (English and Japanese). Japanese names map to the English catalog name. Garbage OCR is never shown as the name. Missing catalog fields say **Unknown**. This step does not need an App ID.
4. **Comparables** — always, after a successful ID. Keywords are the richer identity: **name + collector number + set**. Public TCGPlayer market prices come from pokemontcg.io (no user key). PriceCharting and eBay sold-search links are offered so you can tap through. Live eBay sold listings run only when an App ID is saved and Finding accepts it. Missing or unofficial cards say so instead of inventing a price. Each new photo starts a new scan and refreshes every identity field.

## Optional environment variables

Copy `.env.example` to `.env.local` if you want better photo ID. **None of these are required** for the app to run, and **eBay solds use the on-device App ID**, not a server env secret.

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | Best photo ID (`gpt-4o-mini` vision) |
| `GEMINI_API_KEY` | Vision fallback if OpenAI is unset |
| `POKEMONTCG_API_KEY` | Higher pokemontcg.io rate limits ([free key](https://dev.pokemontcg.io/)) |
| `USD_CAD_RATE` | Optional USD→CAD override. If unset, a public daily rate is fetched (Frankfurter) and labeled as approx. |
| `NEXT_PUBLIC_API_ORIGIN` | Hosted Next/PWA origin baked into the Galaxy Store APK (for example `https://your-app.vercel.app`). Not needed for the website. |

## Scripts

```bash
npm run dev                 # local server, LAN-reachable
npm run build               # production Next.js build
npm start                   # serve the production build
npm test                    # parser / money / sold-band unit tests
npm run icons               # store-safe launcher / 512 listing icons
npm run android:www         # static export of the UI into www/
npm run android:sync        # export UI and copy it into the Android project
npm run android:debug       # export, sync, then ./gradlew assembleDebug
```

## Galaxy Store APK

This repo includes a Capacitor Android wrapper. The phone launcher name, package id, icon, and splash are **TCG Card Scan** — do not put Nintendo or Pokémon trademarks in those store-facing assets. The in-app product is unchanged (photo / find-by-name identify plus public comps).

| Listing field | Value |
| --- | --- |
| Title | **TCG Card Scan** |
| Application ID | `com.midnightman.cardscan` |
| Icon | `store/icon-512.png` (512×512 PNG, no Pokémon/Nintendo marks) |
| Screenshots | 4–8 JPG/PNG images, 320–3840 px, **maximum 2:1** aspect (for example 1080×2160). Capture the real app. Do not paste official card art, Nintendo logos, or the word Pokémon on the images. |
| Feature graphic (optional) | `store/feature-graphic-2x1.png` (2:1, branded chrome only) |

### Build a debug APK

Needs JDK 17+ and the Android SDK (`ANDROID_HOME`). The wrapper ships a static UI and calls your hosted Next.js `/api/*` routes, so camera, gallery, and `localStorage` (eBay App ID) stay on the device.

```bash
npm install
python3 scripts/generate-icons.py
export NEXT_PUBLIC_API_ORIGIN=https://YOUR-PRODUCTION-OR-CLAIMED-PREVIEW.vercel.app
export ANDROID_HOME=/path/to/Android/sdk
npm run android:debug
```

Sideload:

`android/app/build/outputs/apk/debug/app-debug.apk`

Verified Gradle path after a sync:

```bash
cd android && ./gradlew assembleDebug
```

`CAPACITOR_SERVER_URL` is optional and only for live-reload / loading a remote PWA in the WebView. Do not ship that in the store binary.

### Release keystore and signing

Do not commit a keystore. Create one on your machine and keep the passwords offline:

```bash
keytool -genkeypair -v \
  -keystore tcg-card-scan-release.keystore \
  -alias tcg-card-scan \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=TCG Card Scan, O=the midnightman, C=CA"
```

```bash
cp android/keystore.properties.example android/keystore.properties
# set storeFile (path relative to the android/ folder), storePassword, keyAlias, keyPassword
export NEXT_PUBLIC_API_ORIGIN=https://YOUR-PRODUCTION-HOST
npm run android:sync
cd android && ./gradlew assembleRelease
```

Signed output: `android/app/build/outputs/apk/release/app-release.apk`

If `keystore.properties` is missing, `assembleRelease` writes an **unsigned** APK (`app-release-unsigned.apk`). Sign it with [apksigner](https://developer.android.com/tools/apksigner) from build-tools:

```bash
apksigner sign --ks tcg-card-scan-release.keystore \
  --ks-key-alias tcg-card-scan \
  --out tcg-card-scan-release.apk \
  android/app/build/outputs/apk/release/app-release-unsigned.apk
apksigner verify tcg-card-scan-release.apk
```

Galaxy Store also accepts an AAB (`./gradlew bundleRelease`). Samsung can manage the signing key for AAB uploads.

### Samsung Seller Portal (you upload; this repo does not)

Commercial seller status and a D-U-N-S number are on you — this project does not invent or store a DUNS.

1. Sign in at [seller.samsungapps.com](https://seller.samsungapps.com) with your commercial Samsung seller account.
2. **Add new app** → Android. Title: **TCG Card Scan**. Package / application id must match `com.midnightman.cardscan`.
3. Upload the **signed** release APK or AAB.
4. Upload the 512×512 icon and 4–8 screenshots (2:1 max). No Nintendo/Pokémon trademarks in those images.
5. Fill Data safety, a privacy policy URL, category, and age rating.
6. Save as draft and submit when you are ready. Do not use this repo to create a Samsung account or to submit the listing.

## Deploy

Any single Next.js host works (Vercel, Node, Docker). After deploy, open the HTTPS URL in Android Chrome, skip or paste an App ID, then Add to Home screen. Point `NEXT_PUBLIC_API_ORIGIN` at that same HTTPS origin before you build the store APK.

## Privacy

Photos go to this app’s `/api/identify` route (and to OpenAI or Gemini only if those keys are configured on the server). Public comps use pokemontcg.io / TCGdex. Your eBay App ID, if you add one, stays on the phone and is sent only to `/api/solds` so the server can call eBay Finding. There is no user account and no eBay login. The Android wrapper keeps that App ID in WebView `localStorage` (`card-scan.ebayAppId`).
