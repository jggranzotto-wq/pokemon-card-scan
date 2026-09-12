const MIN_YEAR = 1995;
const MAX_YEAR = 2035;

export function isPlausibleTcgYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

/** Official set release dates look like 1999/01/09 or 1999-01-09. */
export function yearFromReleaseDate(value?: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/\b((?:19|20)\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return isPlausibleTcgYear(year) ? year : null;
}

/** Printed copyright year only — never a bare number like HP or 4/102. */
export function yearFromCopyrightText(text?: string | null): number | null {
  if (!text) return null;
  const marked = [
    ...text.matchAll(/(?:©|&copy;|\(c\)|copyright)\s*[,:\s]*((?:19|20)\d{2})/gi),
  ];
  if (!marked.length) return null;
  const year = Number(marked[marked.length - 1][1]);
  return isPlausibleTcgYear(year) ? year : null;
}
