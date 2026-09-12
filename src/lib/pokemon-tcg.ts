import type { CardLanguage, ExtractedCard, PokemonCard } from "../types/card";
import { inferSetFromText } from "./ocr-parse";

const API = "https://api.pokemontcg.io/v2";

type ApiCard = {
  id: string;
  name: string;
  number: string;
  artist?: string;
  rarity?: string;
  set: { id: string; name: string; series?: string; printedTotal?: number };
  images?: { small?: string; large?: string };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, { low?: number; mid?: number; high?: number; market?: number }>;
  };
};

type ApiList<T> = { data: T[] };

function headers(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

let setCache: { names: string[]; at: number } | null = null;

export async function listSetNames(): Promise<string[]> {
  if (setCache && Date.now() - setCache.at < 24 * 60 * 60 * 1000) {
    return setCache.names;
  }
  try {
    const res = await fetch(`${API}/sets?pageSize=250`, { headers: headers() });
    if (!res.ok) return setCache?.names ?? [];
    const json = (await res.json()) as ApiList<{ name: string }>;
    const names = json.data.map((s) => s.name);
    setCache = { names, at: Date.now() };
    return names;
  } catch {
    return setCache?.names ?? [];
  }
}

function tcgplayerSummary(card: ApiCard): PokemonCard["tcgplayer"] {
  const prices = card.tcgplayer?.prices;
  if (!prices) return card.tcgplayer?.url ? { url: card.tcgplayer.url } : undefined;
  const rows = Object.values(prices);
  const markets = rows.map((p) => p.market).filter((n): n is number => typeof n === "number");
  const lows = rows.map((p) => p.low).filter((n): n is number => typeof n === "number");
  const highs = rows.map((p) => p.high).filter((n): n is number => typeof n === "number");
  return {
    url: card.tcgplayer?.url,
    updatedAt: card.tcgplayer?.updatedAt,
    marketUsd: markets.length ? Math.min(...markets) : undefined,
    lowUsd: lows.length ? Math.min(...lows) : undefined,
    highUsd: highs.length ? Math.max(...highs) : undefined,
  };
}

function languageFromSet(setId: string, setName: string): CardLanguage {
  if (/(japanese|jp\b)/i.test(setName) || /jpn|japan/i.test(setId)) return "Japanese";
  return "English";
}

function variantHints(card: ApiCard): string[] {
  const hints: string[] = [];
  if (card.rarity) hints.push(card.rarity);
  const rarity = (card.rarity ?? "").toLowerCase();
  if (rarity.includes("holo")) hints.push("holo");
  if (rarity.includes("reverse")) hints.push("reverse");
  if (rarity.includes("1st") || rarity.includes("first edition")) hints.push("1st edition");
  return Array.from(new Set(hints));
}

function toCard(card: ApiCard): PokemonCard {
  const printedTotal = card.set.printedTotal;
  return {
    id: card.id,
    name: card.name,
    setName: card.set.name,
    setId: card.set.id,
    setSeries: card.set.series,
    number: card.number,
    printedNumber: printedTotal ? `${card.number}/${printedTotal}` : card.number,
    rarity: card.rarity,
    artist: card.artist,
    language: languageFromSet(card.set.id, card.set.name),
    images: { small: card.images?.small, large: card.images?.large },
    variantHints: variantHints(card),
    tcgplayer: tcgplayerSummary(card),
  };
}

function escapeLucene(value: string): string {
  return value.replace(/([+\-!(){}[\]^"~*?:\\/])/g, "\\$1");
}

async function searchCards(q: string): Promise<PokemonCard[]> {
  const url = `${API}/cards?q=${encodeURIComponent(q)}&pageSize=12&orderBy=-set.releaseDate`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return [];
  const json = (await res.json()) as ApiList<ApiCard>;
  return json.data.map(toCard);
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
  if (name && inferredSet) {
    queries.push(`name:"${escapeLucene(name)}" set.name:"${escapeLucene(inferredSet)}"`);
  }
  if (name) {
    queries.push(`name:"${escapeLucene(name)}"`);
  }
  if (name && name.includes(" ")) {
    queries.push(`name:${escapeLucene(name.split(" ")[0])}*`);
  }

  const seen = new Set<string>();
  const out: PokemonCard[] = [];
  for (const q of queries) {
    const rows = await searchCards(q);
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
    if (out.length >= 8) break;
  }

  return rankCandidates(out, extracted).slice(0, 8);
}

export function rankCandidates(cards: PokemonCard[], extracted: ExtractedCard): PokemonCard[] {
  const wantName = extracted.name?.toLowerCase();
  const wantNumber = extracted.collectorNumber?.replace(/^0+/, "");
  const wantSet = extracted.set?.toLowerCase();

  return [...cards].sort((a, b) => score(b) - score(a));

  function score(card: PokemonCard): number {
    let s = 0;
    if (wantName && card.name.toLowerCase() === wantName) s += 8;
    else if (wantName && card.name.toLowerCase().includes(wantName)) s += 4;
    if (wantNumber && card.number.replace(/^0+/, "") === wantNumber) s += 7;
    if (wantSet && card.setName.toLowerCase().includes(wantSet)) s += 5;
    if (extracted.language && card.language === extracted.language) s += 1;
    if (extracted.variant && extracted.variant !== "unknown") {
      const hints = card.variantHints.join(" ").toLowerCase();
      if (hints.includes(extracted.variant)) s += 2;
    }
    return s;
  }
}

export async function getCardById(id: string): Promise<PokemonCard | null> {
  const res = await fetch(`${API}/cards/${encodeURIComponent(id)}`, { headers: headers() });
  if (!res.ok) return null;
  const json = (await res.json()) as { data: ApiCard };
  return toCard(json.data);
}
