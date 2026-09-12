import { yearFromCopyrightText } from "./card-year";
import { photoLooksLikeSlab } from "./grades";
import { EN_TO_JA, JA_TO_EN } from "./pokemon-names-ja";
import { POKEMON_NAMES } from "./pokemon-names";
import type { CardLanguage, CardVariant, ExtractedCard } from "../types/card";

export const READ_FAIL_MESSAGE = "Couldn't read this card — try a flatter, brighter photo";

const SKIP_LINE =
  /^(basic|stage\s*[12]|hp|pokemon|pokémon|trainer|energy|weakness|resistance|retreat|ability|poke-power|poke-body|item|supporter|stadium|illustrator|illustrated|copyright|nintendo|creatures|game freak|the pok[eé]mon company|lv\.|level up|evolves from.*|弱点|抵抗力|にげる|特性|ワザ)$/i;

const JA_NAMES = Object.keys(JA_TO_EN).sort((a, b) => b.length - a.length);

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
    const idx = text.indexOf(n);
    if (idx >= 0) {
      const evolveFrom = text.match(/evolves from\s+([a-z']+)/);
      if (evolveFrom && evolveFrom[1] === n) continue;
      const score = 1.2 + n.length / 40 - idx / 800;
      if (!best || score > best.score) best = { name, score };
      continue;
    }
    if (n.length < 6) continue;
    const words = text.split(" ").filter((w) => /^[a-z']{6,}$/.test(w));
    for (const word of words) {
      if (Math.abs(word.length - n.length) > 2) continue;
      const dist = levenshtein(word, n.replace(/ /g, ""));
      if (dist <= 1 || (n.length >= 8 && dist <= 2)) {
        const score = 0.72 - dist * 0.08;
        if (!best || score > best.score) best = { name, score };
      }
    }
  }
  return best;
}

export function englishNameFromJapanese(text: string): string | undefined {
  if (!/[\u3040-\u30ff\u4e00-\u9faf]/.test(text)) return undefined;
  for (const ja of JA_NAMES) {
    if (text.includes(ja)) return JA_TO_EN[ja];
  }
  return undefined;
}

export function japaneseNameForEnglish(name: string): string | undefined {
  return EN_TO_JA[name];
}

export function detectLanguage(text: string): CardLanguage {
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(text)) return "Japanese";
  if (/\b(japanese|jp|jpn)\b/i.test(text)) return "Japanese";
  return "English";
}

/** True only for a readable printed name — never punctuation soup from a failed OCR. */
export function isPlausibleCardName(name?: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 42) return false;
  if (SKIP_LINE.test(trimmed)) return false;
  if (/[;:|®•_=]{2,}/.test(trimmed)) return false;
  if (/[)(\]\[}{]/.test(trimmed) && !/^[A-Za-z].*'s /.test(trimmed)) return false;

  const letters = trimmed.replace(/[^A-Za-z\u3040-\u30ff\u4e00-\u9faf]/g, "");
  if (letters.length < 3) return false;

  const junk = (trimmed.match(/[^A-Za-z0-9\s'&.\-\u3040-\u30ff\u4e00-\u9faf]/g) || []).length;
  if (junk >= 2) return false;

  if (englishNameFromJapanese(trimmed)) return true;
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(trimmed)) return false;
  if (POKEMON_NAMES.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return true;
  if (bestPokemonName(trimmed)) return true;
  if (/\b(GX|EX|VMAX|VSTAR|V-UNION)\b/i.test(trimmed) && letters.length >= 4) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const realWords = words.filter((w) => /[A-Za-z]{3,}/.test(w));
  if (realWords.length >= 2 && junk === 0 && letters.length >= 8) return true;
  return false;
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
  const promoSlash = text.match(/\b(\d{1,3})\s*\/\s*([A-Z]{1,3}-P|[A-Z]{2,4}P)\b/i);
  if (promoSlash) {
    const suffix = promoSlash[2].toUpperCase().replace(/P$/, "-P").replace("--P", "-P");
    return { number: String(Number(promoSlash[1])), printedTotal: suffix };
  }
  const classic = text.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
  if (classic) {
    return { number: String(Number(classic[1])), printedTotal: classic[2] };
  }
  const promo = text.match(/\b(?:SWSH|SVI|SM|XY|BW|SVP|PR)\s*[- ]?\s*(\d{1,3})\b/i);
  if (promo) return { number: promo[1] };
  return {};
}

function printedNameGuess(lines: string[]): string | undefined {
  for (const line of lines) {
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (!isPlausibleCardName(cleaned)) continue;
    if (bestPokemonName(cleaned) || englishNameFromJapanese(cleaned)) continue;
    if (/\b(GX|EX|VMAX|VSTAR)\b/i.test(cleaned) || cleaned.split(" ").length >= 2) {
      return cleaned.replace(/\s+/g, " ");
    }
  }
  return undefined;
}

export function parseOcrText(raw: string): ExtractedCard {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const usable = lines.filter((line) => !SKIP_LINE.test(line) && !/^\d+$/.test(line));
  const blob = usable.join("\n");
  const nameHit = bestPokemonName(blob);
  const jaName = englishNameFromJapanese(raw);
  const nums = collectorNumber(`${blob}\n${raw}`);
  const language = detectLanguage(raw);
  const variant = detectVariant(raw);
  const isSlab = photoLooksLikeSlab(raw);

  const name = nameHit?.name || jaName || printedNameGuess(usable);
  const confidence = nameHit ? Math.min(0.92, nameHit.score) : jaName ? 0.88 : name ? 0.62 : 0.1;

  return {
    name: isPlausibleCardName(name) ? name : undefined,
    collectorNumber: nums.number,
    printedTotal: nums.printedTotal,
    set: nums.printedTotal && /P$/i.test(nums.printedTotal) ? nums.printedTotal : undefined,
    variant,
    language,
    isSlab,
    grade: null,
    confidence,
    ocrText: raw.slice(0, 4000),
    copyrightYear: yearFromCopyrightText(raw),
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
