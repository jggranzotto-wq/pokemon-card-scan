import type { CatalogSet } from "../types/card";
import { POKEMON_NAMES } from "./pokemon-names";

export function yearsFromSets(sets: CatalogSet[]): number[] {
  return Array.from(new Set(sets.map((set) => set.year).filter((year): year is number => typeof year === "number"))).sort(
    (a, b) => b - a,
  );
}

export function filterSetsByYear(sets: CatalogSet[], year?: number | null): CatalogSet[] {
  const rows = year ? sets.filter((set) => set.year === year) : sets;
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "en") || (b.year ?? 0) - (a.year ?? 0));
}

export function preferDisplaySetName(ptcgName: string, tcgdexName?: string): string {
  const official = tcgdexName?.trim();
  const fallback = ptcgName.trim();
  if (!official) return fallback;
  if (official.toLowerCase() === fallback.toLowerCase()) return official;
  if (fallback.toLowerCase() === "base" && /base set/i.test(official)) return official;
  if (official.toLowerCase().includes(fallback.toLowerCase()) && official.length > fallback.length) return official;
  return official;
}

/** Local species suggestions while catalog results load. Never invents names. */
export function suggestLocalNames(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of POKEMON_NAMES) {
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) starts.push(name);
    else if (lower.includes(q)) contains.push(name);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export function mergeNameSuggestions(query: string, catalogNames: string[], limit = 12): string[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string) => {
    const key = name.trim();
    if (!key || seen.has(key.toLowerCase())) return;
    seen.add(key.toLowerCase());
    out.push(key);
  };
  for (const name of catalogNames) {
    if (name.toLowerCase().startsWith(q) || name.toLowerCase().includes(q)) add(name);
  }
  for (const name of suggestLocalNames(query, limit)) add(name);
  return out.slice(0, limit);
}

export function parseCollectorInput(value?: string): { collectorNumber?: string; printedTotal?: string } {
  const text = value?.trim();
  if (!text) return {};
  const match = text.match(/^(\d+)\s*\/\s*([A-Za-z0-9-]+)$/);
  if (match) return { collectorNumber: match[1].replace(/^0+/, "") || match[1], printedTotal: match[2] };
  return { collectorNumber: text.replace(/^0+/, "") || text };
}

export function noManualMatchMessage(input: { name: string; year?: number | null; setName?: string }): string {
  const parts = [input.name.trim()];
  if (input.setName) parts.push(input.setName);
  if (input.year) parts.push(String(input.year));
  return `No catalog match for ${parts.join(" · ")}. Try another year or set, or check the spelling.`;
}
