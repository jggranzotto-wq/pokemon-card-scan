export function collectionTimeZone(): string {
  return process.env.COLLECTION_TIMEZONE?.trim() || "America/Toronto";
}

/** Calendar day in the seller's timezone (default Eastern Time). */
export function collectionDay(now = new Date(), timeZone = collectionTimeZone()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function previousDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date - 1));
  return utc.toISOString().slice(0, 10);
}
