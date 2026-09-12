export function detectGrade(title: string): { grade: string; isGraded: boolean } {
  const text = title.replace(/\s+/g, " ");
  const slab = text.match(
    /\b(PSA|BGS|CGC|SGC|ACE|TAG)\s*(?:GEM\s*)?(?:MINT\s*)?(\d{1,2}(?:\.\d)?)\b/i,
  );
  if (slab) {
    const company = slab[1].toUpperCase();
    const score = slab[2];
    return { grade: `${company} ${score}`, isGraded: true };
  }

  if (/\b(PSA|BGS|CGC|SGC)\s*(AUTH|A)\b/i.test(text)) {
    return { grade: "Authenticated slab", isGraded: true };
  }

  if (/\b(slab|graded|encapsulated)\b/i.test(text) && !/\b(ungraded|raw)\b/i.test(text)) {
    return { grade: "Graded (see title)", isGraded: true };
  }

  return { grade: "Raw", isGraded: false };
}

export function photoLooksLikeSlab(text: string): boolean {
  return (
    /\b(PSA|BGS|CGC|SGC|ACE|TAG)\b/i.test(text) &&
    (/\b\d{1,2}(?:\.\d)?\b/.test(text) || /\bcert\b/i.test(text) || /\bgraded\b/i.test(text))
  );
}
