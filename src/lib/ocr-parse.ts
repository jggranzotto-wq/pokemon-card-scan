import { POKEMON_NAMES } from "./pokemon-names";
import { photoLooksLikeSlab } from "./grades";
import type { CardLanguage, CardVariant, ExtractedCard } from "../types/card";

const SKIP_LINE =
  /^(basic|stage\s*[12]|hp|pokemon|pokémon|trainer|energy|weakness|resistance|retreat|ability|poke-power|poke-body|item|supporter|stadium|illustrator|illustrated|copyright|nintendo|creatures|game freak|the pok[eé]mon company|lv\.|level up)$/i;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9:.\-\/♀♂' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

function bestPokemonName(haystack: string): { name: string; score: number } | null {
  const text = normalize(haystack);
  if (!text) return null;

  let best: { name: string; score: number } | null = null;
  for (const name of POKEMON_NAMES) {
    const n = normalize(name);
    if (!n) continue;
    if (text.includes(n)) {
      const score = 1 + n.length / 40;
      if (!best || score > best.score) best = { name, score };
      continue;
    }
    if (n.length < 4) continue;
    const words = text.split(" ").filter((w) => w.length >= 3);
    for (const word of words) {
      if (Math.abs(word.length - n.length) > 2) continue;
      const dist = levenshtein(word, n.replace(/ /g, ""));
      if (dist <= 1 || (n.length >= 7 && dist <= 2)) {
        const score = 0.72 - dist * 0.08;
        if (!best || score > best.score) best = { name, score };
      }
    }
  }
  return best;
}

function detectLanguage(text: string): CardLanguage {
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(text)) return "Japanese";
  if (/\b(japanese|jp|jpn)\b/i.test(text)) return "Japanese";
  return "English";
}

function detectVariant(text: string): CardVariant {
  const t = text.toLowerCase();
  if (/1st\s*edition|first\s*edition|\b1ed\b/.test(t)) return "1st edition";
  if (/shadowless/.test(t)) return "shadowless";
  if (/reverse\s*holo|reverse\s*foil/.test(t)) return "reverse";
  if (/\bholo(?:graphic)?\b|\bfoil\b/.test(t)) return "holo";
  if (/unlimited/.test(t)) return "unlimited";
  return "unknown";
}

function collectorNumber(text: string): { number?: string; printedTotal?: string } {
  const classic = text.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
  if (classic) {
    return { number: String(Number(classic[1])), printedTotal: classic[2] };
  }
  const promo = text.match(/\b(?:SWSH|SVI|SM|XY|BW|SVP|PR)\s*[- ]?\s*(\d{1,3})\b/i);
  if (promo) return { number: promo[1] };
  return {};
}

export function parseOcrText(raw: string): ExtractedCard {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const usable = lines.filter((line) => !SKIP_LINE.test(line) && !/^\d+$/.test(line));
  const blob = usable.join("\n");
  const nameHit = bestPokemonName(blob);
  const nums = collectorNumber(blob);
  const language = detectLanguage(raw);
  const variant = detectVariant(raw);
  const isSlab = photoLooksLikeSlab(raw);

  let name = nameHit?.name;
  if (!name) {
    const guess = usable.find((line) => {
      const n = normalize(line);
      return n.length >= 3 && n.length <= 24 && !/\d/.test(n) && !SKIP_LINE.test(n);
    });
    name = guess;
  }

  return {
    name,
    collectorNumber: nums.number,
    printedTotal: nums.printedTotal,
    variant,
    language,
    isSlab,
    grade: null,
    confidence: nameHit ? Math.min(0.92, nameHit.score) : name ? 0.35 : 0.1,
    ocrText: raw.slice(0, 4000),
  };
}

export function inferSetFromText(text: string, setNames: string[]): string | undefined {
  const n = normalize(text);
  let found: { name: string; score: number } | undefined;
  for (const setName of setNames) {
    const s = normalize(setName);
    if (s.length < 4) continue;
    if (n.includes(s)) {
      const score = s.length;
      if (!found || score > found.score) found = { name: setName, score };
    }
  }
  return found?.name;
}

export function buildSearchQuery(extracted: ExtractedCard): string {
  return [extracted.name, extracted.set, extracted.collectorNumber].filter(Boolean).join(" ");
}
