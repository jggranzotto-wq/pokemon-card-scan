import type { CardLanguage, CatalogSet, ExtractedCard, PokemonCard } from "../types/card";
import { preferDisplaySetName } from "./catalog";
import { yearFromReleaseDate } from "./card-year";
import { englishNameFromJapanese, inferSetFromText, japaneseNameForEnglish } from "./ocr-parse";

const POKEMONTCG = "https://api.pokemontcg.io/v2";
const TCGDEX = "https://api.tcgdex.net/v2";

const COMMON_SETS = [
  "Base",
  "Base Set",
  "Base Set 2",
  "Jungle",
  "Fossil",
  "Team Rocket",
  "Gym Heroes",
  "Gym Challenge",
  "Neo Genesis",
  "Neo Discovery",
  "Neo Revelation",
  "Neo Destiny",
  "Legendary Collection",
  "Expedition",
  "Aquapolis",
  "Skyridge",
  "Ruby & Sapphire",
  "Sandstorm",
  "Dragon",
  "Team Magma vs Team Aqua",
  "Hidden Legends",
  "FireRed & LeafGreen",
  "Team Rocket Returns",
  "Deoxys",
  "Emerald",
  "Unseen Forces",
  "Delta Species",
  "Legend Maker",
  "Holon Phantoms",
  "Crystal Guardians",
  "Dragon Frontiers",
  "Power Keepers",
  "Diamond & Pearl",
  "Mysterious Treasures",
  "Secret Wonders",
  "Great Encounters",
  "Majestic Dawn",
  "Legends Awakened",
  "Stormfront",
  "Platinum",
  "Rising Rivals",
  "Supreme Victors",
  "Arceus",
  "HeartGold & SoulSilver",
  "Unleashed",
  "Undaunted",
  "Triumphant",
  "Call of Legends",
  "Black & White",
  "Emerging Powers",
  "Noble Victories",
  "Next Destinies",
  "Dark Explorers",
  "Dragons Exalted",
  "Boundaries Crossed",
  "Plasma Storm",
  "Plasma Freeze",
  "Plasma Blast",
  "Legendary Treasures",
  "XY",
  "Flashfire",
  "Furious Fists",
  "Phantom Forces",
  "Primal Clash",
  "Roaring Skies",
  "Ancient Origins",
  "BREAKthrough",
  "BREAKpoint",
  "Fates Collide",
  "Steam Siege",
  "Evolutions",
  "Sun & Moon",
  "Guardians Rising",
  "Burning Shadows",
  "Crimson Invasion",
  "Ultra Prism",
  "Forbidden Light",
  "Celestial Storm",
  "Lost Thunder",
  "Team Up",
  "Unbroken Bonds",
  "Unified Minds",
  "Cosmic Eclipse",
  "Sword & Shield",
  "Rebel Clash",
  "Darkness Ablaze",
  "Vivid Voltage",
  "Battle Styles",
  "Chilling Reign",
  "Evolving Skies",
  "Fusion Strike",
  "Brilliant Stars",
  "Astral Radiance",
  "Lost Origin",
  "Silver Tempest",
  "Crown Zenith",
  "Scarlet & Violet",
  "Paldea Evolved",
  "Obsidian Flames",
  "Paradox Rift",
  "Paldean Fates",
  "Temporal Forces",
  "Twilight Masquerade",
  "Shrouded Fable",
  "Stellar Crown",
  "Surging Sparks",
  "Prismatic Evolutions",
  "Journey Together",
  "Destined Rivals",
  "Black Bolt",
  "White Flare",
];

type ApiCard = {
  id: string;
  name: string;
  number: string;
  artist?: string;
  rarity?: string;
  set: { id: string; name: string; series?: string; printedTotal?: number; releaseDate?: string };
  images?: { small?: string; large?: string };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, { low?: number; mid?: number; high?: number; market?: number }>;
  };
};

type ApiList<T> = { data: T[] };

type TcgdexListCard = {
  id: string;
  localId: string;
  name: string;
  image?: string;
};

type TcgdexSet = { id: string; name: string; cardCount?: { official?: number }; releaseDate?: string };

type TcgdexCard = TcgdexListCard & {
  rarity?: string;
  illustrator?: string;
  set?: TcgdexSet;
  variants?: { firstEdition?: boolean; holo?: boolean; reverse?: boolean };
  pricing?: {
    tcgplayer?: {
      updated?: string;
      holofoil?: { marketPrice?: number; lowPrice?: number; midPrice?: number; highPrice?: number };
      normal?: { marketPrice?: number; lowPrice?: number; midPrice?: number; highPrice?: number };
      reverseHolofoil?: { marketPrice?: number; lowPrice?: number; midPrice?: number; highPrice?: number };
    };
  };
};

const UA = { "User-Agent": "pokemon-card-scan/1.0 (https://github.com/jggranzotto-wq/pokemon-card-scan)" };

function pokemonTcgHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { ...UA, "X-Api-Key": key } : UA;
}

let setCache: { names: string[]; byId: Record<string, TcgdexSet>; at: number } | null = null;
const setYearById = new Map<string, number>();
let setYearsAt = 0;
let catalogCache: { sets: CatalogSet[]; at: number } | null = null;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function listSetNames(): Promise<string[]> {
  if (setCache && Date.now() - setCache.at < 24 * 60 * 60 * 1000) {
    return setCache.names;
  }

  const [enSets, jaSets] = await Promise.all([
    fetchJson<TcgdexSet[]>(`${TCGDEX}/en/sets`),
    fetchJson<TcgdexSet[]>(`${TCGDEX}/ja/sets`),
  ]);
  if (enSets?.length || jaSets?.length) {
    const byId: Record<string, TcgdexSet> = {};
    for (const set of enSets ?? []) byId[set.id] = set;
    for (const set of jaSets ?? []) {
      byId[set.id] = set;
      rememberSetYear(set.id, set.releaseDate);
    }
    const names = Array.from(
      new Set([...COMMON_SETS, ...(enSets ?? []).map((s) => s.name), ...(jaSets ?? []).map((s) => s.name)]),
    );
    setCache = { names, byId, at: Date.now() };
    return names;
  }

  const pokemon = await fetchJson<ApiList<{ id: string; name: string }>>(`${POKEMONTCG}/sets?pageSize=250`, {
    headers: pokemonTcgHeaders(),
  });
  if (pokemon?.data?.length) {
    const byId: Record<string, TcgdexSet> = {};
    for (const set of pokemon.data) byId[set.id] = { id: set.id, name: set.name };
    const names = Array.from(new Set([...COMMON_SETS, ...pokemon.data.map((s) => s.name)]));
    setCache = { names, byId, at: Date.now() };
    return names;
  }

  setCache = { names: COMMON_SETS, byId: {}, at: Date.now() };
  return COMMON_SETS;
}

function rememberSetYear(setId: string | undefined, releaseDate?: string | null) {
  if (!setId) return;
  const year = yearFromReleaseDate(releaseDate);
  if (year) setYearById.set(setId, year);
}

async function fetchPokemonTcgSets(): Promise<Array<{ id: string; name: string; releaseDate?: string }>> {
  const rows: Array<{ id: string; name: string; releaseDate?: string }> = [];
  for (let page = 1; page <= 4; page += 1) {
    const pokemon = await fetchJson<ApiList<{ id: string; name: string; releaseDate?: string }>>(
      `${POKEMONTCG}/sets?pageSize=250&page=${page}`,
      { headers: pokemonTcgHeaders() },
    );
    const pageRows = pokemon?.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < 250) break;
  }
  if (rows.length) return rows;

  const dump = await fetchJson<Array<{ id: string; name: string; releaseDate?: string }>>(
    "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json",
  );
  return dump ?? [];
}

async function ensureSetYears(): Promise<void> {
  if (setYearById.size && Date.now() - setYearsAt < 24 * 60 * 60 * 1000) return;
  const rows = await fetchPokemonTcgSets();
  for (const set of rows) rememberSetYear(set.id, set.releaseDate);
  setYearsAt = Date.now();
}

export async function listCatalogSets(): Promise<CatalogSet[]> {
  if (catalogCache && Date.now() - catalogCache.at < 24 * 60 * 60 * 1000) {
    return catalogCache.sets;
  }

  await listSetNames();
  const [ptcgSets, enSets] = await Promise.all([fetchPokemonTcgSets(), fetchJson<TcgdexSet[]>(`${TCGDEX}/en/sets`)]);
  const tcgdexById = new Map((enSets ?? []).map((set) => [set.id, set]));
  const seen = new Set<string>();
  const sets: CatalogSet[] = [];

  const add = (id: string, name: string, releaseDate?: string | null) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    rememberSetYear(id, releaseDate);
    const year = yearFromReleaseDate(releaseDate) ?? setYearById.get(id) ?? null;
    sets.push({ id, name, year });
  };

  for (const set of ptcgSets) {
    const tcgdex = tcgdexById.get(set.id);
    add(set.id, preferDisplaySetName(set.name, tcgdex?.name || setCache?.byId[set.id]?.name), set.releaseDate);
  }
  for (const set of enSets ?? []) {
    add(set.id, set.name, set.releaseDate);
  }

  catalogCache = { sets, at: Date.now() };
  return sets;
}

export async function suggestCatalogNames(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const list = await fetchJson<TcgdexListCard[]>(`${TCGDEX}/en/cards?name=${encodeURIComponent(q)}`);
  const names = Array.from(new Set((list ?? []).map((card) => catalogName(card.name)).filter(Boolean)));
  return names.slice(0, 20);
}

async function resolveSetYear(setId: string): Promise<number | null> {
  await ensureSetYears();
  const cached = setYearById.get(setId);
  if (cached) return cached;

  const tcgdex =
    (await fetchJson<TcgdexSet>(`${TCGDEX}/en/sets/${encodeURIComponent(setId)}`)) ??
    (await fetchJson<TcgdexSet>(`${TCGDEX}/ja/sets/${encodeURIComponent(setId)}`));
  rememberSetYear(setId, tcgdex?.releaseDate);
  return setYearById.get(setId) ?? yearFromReleaseDate(tcgdex?.releaseDate);
}

function isPromoSetId(setId?: string): boolean {
  return Boolean(setId && /^[A-Za-z0-9]{1,4}-P$/i.test(setId));
}

function printedSetName(setId: string, fallback?: string): string {
  const tcgdexName =
    setCache?.byId[setId]?.name || catalogCache?.sets.find((set) => set.id === setId)?.name;
  return preferDisplaySetName(fallback || setId, tcgdexName);
}

function yearForSet(setId: string, releaseDate?: string | null): number | null {
  rememberSetYear(setId, releaseDate);
  return yearFromReleaseDate(releaseDate) ?? setYearById.get(setId) ?? null;
}

const TCGPLAYER_PRINT_ORDER = [
  "holofoil",
  "1stEditionHolofoil",
  "unlimitedHolofoil",
  "reverseHolofoil",
  "normal",
];

function hasUsdPrice(row?: { low?: number; mid?: number; high?: number; market?: number } | null): boolean {
  if (!row) return false;
  return [row.low, row.mid, row.high, row.market].some((n) => typeof n === "number" && n > 0);
}

function pickTcgplayerRow(
  prices: Record<string, { low?: number; mid?: number; high?: number; market?: number }>,
): { key: string; row: { low?: number; mid?: number; high?: number; market?: number } } | null {
  for (const key of TCGPLAYER_PRINT_ORDER) {
    const row = prices[key];
    if (hasUsdPrice(row)) return { key, row };
  }
  for (const [key, row] of Object.entries(prices)) {
    if (hasUsdPrice(row)) return { key, row };
  }
  return null;
}

function tcgplayerSummary(card: ApiCard): PokemonCard["tcgplayer"] {
  const prices = card.tcgplayer?.prices;
  const picked = prices ? pickTcgplayerRow(prices) : null;
  if (!picked && !card.tcgplayer?.url) return undefined;
  return {
    url: card.tcgplayer?.url,
    updatedAt: card.tcgplayer?.updatedAt,
    printing: picked?.key,
    marketUsd: picked?.row.market,
    lowUsd: picked?.row.low,
    midUsd: picked?.row.mid,
    highUsd: picked?.row.high,
  };
}

function languageFromSet(setId: string, setName: string, hint?: CardLanguage): CardLanguage {
  if (hint === "Japanese") return "Japanese";
  if (/(japanese|jp\b)/i.test(setName) || /jpn|japan/i.test(setId)) return "Japanese";
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(setName)) return "Japanese";
  return "English";
}

function catalogName(name: string): string {
  return englishNameFromJapanese(name) || name;
}

function variantHintsFromRarity(rarity?: string, extras: string[] = []): string[] {
  const hints = [...extras];
  if (rarity) hints.push(rarity);
  const text = hints.join(" ").toLowerCase();
  if (text.includes("holo")) hints.push("holo");
  if (text.includes("reverse")) hints.push("reverse");
  if (text.includes("1st") || text.includes("first edition")) hints.push("1st edition");
  return Array.from(new Set(hints));
}

function toCard(card: ApiCard): PokemonCard {
  const printedTotal = card.set.printedTotal;
  return {
    id: card.id,
    name: card.name,
    setName: printedSetName(card.set.id, card.set.name),
    setId: card.set.id,
    setSeries: card.set.series,
    number: card.number,
    printedNumber: printedTotal ? `${card.number}/${printedTotal}` : card.number,
    rarity: card.rarity,
    setYear: yearForSet(card.set.id, card.set.releaseDate),
    artist: card.artist,
    language: languageFromSet(card.set.id, card.set.name),
    images: { small: card.images?.small, large: card.images?.large },
    variantHints: variantHintsFromRarity(card.rarity),
    tcgplayer: tcgplayerSummary(card),
  };
}

function setIdFromCardId(id: string): string {
  const cut = id.lastIndexOf("-");
  return cut > 0 ? id.slice(0, cut) : id;
}

function tcgdexImages(image?: string): { small?: string; large?: string } {
  if (!image) return {};
  return { small: `${image}/low.webp`, large: `${image}/high.webp` };
}

function tcgdexToCard(card: TcgdexListCard, set?: TcgdexSet, detail?: TcgdexCard, languageHint?: CardLanguage): PokemonCard {
  const resolvedSet = detail?.set ?? set;
  const setId = resolvedSet?.id ?? setIdFromCardId(card.id);
  const number = card.localId.replace(/^0+/, "") || card.localId;
  const printedTotal = resolvedSet?.cardCount?.official;
  const extras: string[] = [];
  if (detail?.variants?.firstEdition) extras.push("1st edition");
  if (detail?.variants?.holo) extras.push("holo");
  if (detail?.variants?.reverse) extras.push("reverse");
  const prices = detail?.pricing?.tcgplayer;
  const printRow = prices?.holofoil ?? prices?.reverseHolofoil ?? prices?.normal;
  const printing = prices?.holofoil
    ? "holofoil"
    : prices?.reverseHolofoil
      ? "reverseHolofoil"
      : prices?.normal
        ? "normal"
        : undefined;
  const market = printRow?.marketPrice;
  const low = printRow?.lowPrice;
  const mid = printRow?.midPrice;
  const high = printRow?.highPrice;
  const printedNumber = isPromoSetId(setId)
    ? `${card.localId}/${setId}`
    : printedTotal
      ? `${number}/${printedTotal}`
      : number;
  return {
    id: card.id,
    name: catalogName(card.name),
    setName: printedSetName(setId, resolvedSet?.name),
    setId,
    number,
    printedNumber,
    rarity: detail?.rarity,
    setYear: yearForSet(resolvedSet?.id ?? setIdFromCardId(card.id), resolvedSet?.releaseDate),
    artist: detail?.illustrator,
    language: languageFromSet(setId, resolvedSet?.name ?? "", languageHint),
    images: tcgdexImages(card.image ?? detail?.image),
    variantHints: variantHintsFromRarity(detail?.rarity, extras),
    tcgplayer:
      market || low || mid
        ? {
            updatedAt: prices?.updated,
            printing,
            marketUsd: market,
            lowUsd: low,
            midUsd: mid,
            highUsd: high,
          }
        : undefined,
  };
}

function escapeLucene(value: string): string {
  return value.replace(/([+\-!(){}[\]^"~*?:\\/])/g, "\\$1");
}

async function searchPokemonTcg(q: string): Promise<PokemonCard[]> {
  const url = `${POKEMONTCG}/cards?q=${encodeURIComponent(q)}&pageSize=12`;
  const json = await fetchJson<ApiList<ApiCard>>(url, { headers: pokemonTcgHeaders() });
  return json?.data?.map(toCard) ?? [];
}

async function searchTcgdex(extracted: ExtractedCard): Promise<PokemonCard[]> {
  const name = extracted.name?.trim();
  if (!name) return [];
  const jaName = japaneseNameForEnglish(name) || (extracted.language === "Japanese" ? name : undefined);
  const langs: Array<{ lang: "en" | "ja"; q: string }> = [{ lang: "en", q: name }];
  if (jaName && jaName !== name) langs.push({ lang: "ja", q: jaName });
  else if (extracted.language === "Japanese") langs.push({ lang: "ja", q: name });

  await listSetNames();
  const wantNumber = extracted.collectorNumber?.replace(/^0+/, "");
  const wantSet = (extracted.set || extracted.printedTotal || "").toLowerCase();
  const out: PokemonCard[] = [];
  for (const { lang, q } of langs) {
    const list = await fetchJson<TcgdexListCard[]>(`${TCGDEX}/${lang}/cards?name=${encodeURIComponent(q)}`);
    if (!list?.length) continue;
    const filtered = list.filter((card) => {
      const setId = setIdFromCardId(card.id);
      if (wantSet && isPromoSetId(wantSet) && setId.toLowerCase() !== wantSet) return false;
      if (!wantNumber) return true;
      return card.localId.replace(/^0+/, "") === wantNumber;
    });
    const pool = filtered.length ? filtered : list;
    for (const card of pool.slice(0, 24)) {
      const set = setCache?.byId[setIdFromCardId(card.id)];
      out.push(tcgdexToCard(card, set, undefined, lang === "ja" ? "Japanese" : extracted.language));
    }
  }
  return rankCandidates(out, extracted).slice(0, 8);
}

export async function lookupCards(extracted: ExtractedCard): Promise<PokemonCard[]> {
  const setNames = await listSetNames();
  const inferredSet = extracted.set ?? inferSetFromText(extracted.ocrText ?? "", setNames);
  if (inferredSet && !extracted.set) extracted.set = inferredSet;

  const name = extracted.name?.trim();
  const number = extracted.collectorNumber?.trim();
  const queries: string[] = [];

  if (name && number) {
    queries.push(`name:"${escapeLucene(name)}" number:"${escapeLucene(number)}"`);
  }
  if (name && extracted.setId) {
    queries.push(`name:"${escapeLucene(name)}" set.id:${escapeLucene(extracted.setId)}`);
  }
  if (name && inferredSet) {
    queries.push(`name:"${escapeLucene(name)}" set.name:"${escapeLucene(inferredSet)}"`);
  }
  if (name) {
    queries.push(`name:"${escapeLucene(name)}"`);
  }

  const seen = new Set<string>();
  const out: PokemonCard[] = [];
  const add = (rows: PokemonCard[]) => {
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  };

  for (const q of queries) {
    add(await searchPokemonTcg(q));
    if (out.length >= 12) break;
  }
  add(await searchTcgdex(extracted));

  const hydrated = await hydrateCards(rankCandidates(out, extracted).slice(0, 16));
  const year = extracted.setYear;
  const yearMatches = typeof year === "number" ? hydrated.filter((card) => card.setYear === year) : hydrated;
  const pool = yearMatches.length ? yearMatches : hydrated;
  return rankCandidates(pool, extracted).slice(0, 8);
}

async function hydrateCards(cards: PokemonCard[]): Promise<PokemonCard[]> {
  await ensureSetYears();
  return Promise.all(cards.map(hydrateCard));
}

async function hydrateCard(card: PokemonCard): Promise<PokemonCard> {
  let next: PokemonCard = {
    ...card,
    setName: printedSetName(card.setId, card.setName),
    setYear: card.setYear ?? setYearById.get(card.setId) ?? null,
  };

  if (!next.rarity) {
    const detail = await getCardById(card.id);
    if (detail) {
      next = {
        ...next,
        rarity: detail.rarity || next.rarity,
        setYear: detail.setYear ?? next.setYear,
        setName: printedSetName(detail.setId || next.setId, detail.setName || next.setName),
        images: detail.images.small ? detail.images : next.images,
        tcgplayer: detail.tcgplayer ?? next.tcgplayer,
        variantHints: detail.variantHints.length ? detail.variantHints : next.variantHints,
      };
    }
  }

  if (next.setYear == null) {
    next = { ...next, setYear: await resolveSetYear(next.setId) };
  }
  return next;
}

export function rankCandidates(cards: PokemonCard[], extracted: ExtractedCard): PokemonCard[] {
  const wantName = extracted.name?.toLowerCase();
  const wantNumber = extracted.collectorNumber?.replace(/^0+/, "");
  const wantSet = extracted.set?.toLowerCase();
  const wantSetId = extracted.setId?.toLowerCase();
  const wantYear = extracted.setYear;

  return [...cards].sort((a, b) => score(b) - score(a));

  function score(card: PokemonCard): number {
    let s = 0;
    if (wantName && card.name.toLowerCase() === wantName) s += 8;
    else if (wantName && card.name.toLowerCase().includes(wantName)) s += 4;
    if (wantNumber && card.number.replace(/^0+/, "") === wantNumber) s += 7;
    if (wantSetId && card.setId.toLowerCase() === wantSetId) s += 10;
    if (wantSet && card.setName.toLowerCase() === wantSet) s += 8;
    else if (wantSet && card.setId.toLowerCase() === wantSet) s += 8;
    else if (wantSet && card.setName.toLowerCase().includes(wantSet)) s += 2;
    if (wantYear && card.setYear === wantYear) s += 6;
    if (extracted.printedTotal && card.printedNumber.endsWith(`/${extracted.printedTotal}`)) s += 6;
    if (extracted.language && card.language === extracted.language) s += 1;
    if (extracted.variant && extracted.variant !== "unknown") {
      const hints = card.variantHints.join(" ").toLowerCase();
      if (hints.includes(extracted.variant)) s += 2;
    }
    return s;
  }
}

export async function getCardById(id: string): Promise<PokemonCard | null> {
  await listSetNames();
  const pokemon = await fetchJson<{ data: ApiCard }>(`${POKEMONTCG}/cards/${encodeURIComponent(id)}`, {
    headers: pokemonTcgHeaders(),
  });
  if (pokemon?.data) return toCard(pokemon.data);

  for (const lang of ["en", "ja"] as const) {
    const detail = await fetchJson<TcgdexCard>(`${TCGDEX}/${lang}/cards/${encodeURIComponent(id)}`);
    if (detail?.id) {
      const card = tcgdexToCard(detail, detail.set, detail, lang === "ja" ? "Japanese" : undefined);
      if (card.setYear == null) {
        card.setYear = await resolveSetYear(card.setId);
      }
      return card;
    }
  }
  return null;
}
