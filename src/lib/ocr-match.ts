import type { ExtractedCard, PokemonCard } from "../types/card";

export const OCR_UNCLEAR_MESSAGE = "Couldn't read the card clearly. Search by name.";

/** Hamming distance at or below this, and clearly ahead of the next card, auto-selects. */
export const STRONG_HASH_DISTANCE = 14;

/** The next card must be at least this many bits worse before the best one is chosen. */
export const STRONG_HASH_MARGIN = 5;

/** Farther than this, a name-only or number-only guess is not shown. */
export const WEAK_HASH_DISTANCE = 28;

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
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

export function namesAreFuzzyMatch(cardName: string, readName: string): boolean {
  const card = normalizeName(cardName);
  const read = normalizeName(readName);
  if (!card || !read) return false;
  if (card === read || card.includes(read) || read.includes(card)) return true;
  if (Math.min(card.length, read.length) < 5) return false;
  const limit = Math.max(card.length, read.length) >= 8 ? 2 : 1;
  return levenshtein(card, read) <= limit;
}

export function collectorMatches(card: PokemonCard, extracted: ExtractedCard): boolean {
  const wanted = extracted.collectorNumber?.replace(/^0+/, "");
  if (!wanted) return false;
  if (card.number.replace(/^0+/, "") !== wanted) return false;
  if (!extracted.printedTotal) return true;
  const total = extracted.printedTotal.toLowerCase();
  return card.printedNumber.toLowerCase().endsWith(`/${total}`) || card.setId.toLowerCase() === total;
}

export function selectOcrPool(cards: PokemonCard[], extracted: ExtractedCard, limit = 12): PokemonCard[] {
  const both: PokemonCard[] = [];
  const numberOnly: PokemonCard[] = [];
  const nameOnly: PokemonCard[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    const nameOk = extracted.name ? namesAreFuzzyMatch(card.name, extracted.name) : false;
    const numberOk = collectorMatches(card, extracted);
    if (!nameOk && !numberOk) continue;
    seen.add(card.id);
    if (nameOk && numberOk) both.push(card);
    else if (numberOk) numberOnly.push(card);
    else nameOnly.push(card);
  }
  return [...both, ...numberOnly, ...nameOnly].slice(0, limit);
}

function bothMatch(card: PokemonCard, extracted: ExtractedCard): boolean {
  return Boolean(extracted.name && extracted.collectorNumber && namesAreFuzzyMatch(card.name, extracted.name) && collectorMatches(card, extracted));
}

export function matchScore(card: PokemonCard, extracted: ExtractedCard, distance: number | null): number {
  let ocr = 0;
  if (extracted.name && namesAreFuzzyMatch(card.name, extracted.name)) {
    ocr += normalizeName(card.name) === normalizeName(extracted.name) ? 0.55 : 0.35;
  }
  if (collectorMatches(card, extracted)) ocr += extracted.printedTotal ? 0.45 : 0.3;
  const image = distance == null ? 0.25 : 1 - distance / 64;
  return ocr * 0.45 + image * 0.55;
}

export function decideOcrIdentification(input: {
  extracted: ExtractedCard;
  cards: PokemonCard[];
  /** Present when the uploaded photo was hashed against catalog art. */
  distances?: Map<string, number> | null;
}): { candidates: PokemonCard[]; autoSelectedId?: string; message?: string } {
  const { extracted } = input;
  const photo = input.distances != null;
  if (!extracted.name && !extracted.collectorNumber) {
    return { candidates: [], message: OCR_UNCLEAR_MESSAGE };
  }

  if (!photo) {
    const both = input.cards.filter((card) => bothMatch(card, extracted));
    if (!both.length) return { candidates: [], message: OCR_UNCLEAR_MESSAGE };
    return { candidates: both.slice(0, 8) };
  }

  const pool = selectOcrPool(input.cards, extracted);
  if (!pool.length) return { candidates: [], message: OCR_UNCLEAR_MESSAGE };

  const distances = input.distances ?? new Map<string, number>();
  const ranked = [...pool].sort(
    (a, b) => matchScore(b, extracted, distances.get(b.id) ?? null) - matchScore(a, extracted, distances.get(a.id) ?? null),
  );
  const top = ranked[0];
  const second = ranked[1];
  const topDistance = distances.get(top.id);
  if (topDistance != null && topDistance > WEAK_HASH_DISTANCE && !bothMatch(top, extracted)) {
    return { candidates: [], message: OCR_UNCLEAR_MESSAGE };
  }

  const secondDistance = second ? distances.get(second.id) : undefined;
  const strong =
    topDistance != null &&
    topDistance <= STRONG_HASH_DISTANCE &&
    (secondDistance == null || secondDistance >= topDistance + STRONG_HASH_MARGIN);
  return {
    candidates: ranked.slice(0, 8),
    autoSelectedId: strong ? top.id : undefined,
  };
}
