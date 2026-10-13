export const VARIANTS = [
  { id: "standard", label: "Standard / non-holo" },
  { id: "holo", label: "Holo" },
  { id: "reverse holo", label: "Reverse holo" },
  { id: "1st edition", label: "1st edition" },
  { id: "1st edition holo", label: "1st edition holo" },
  { id: "shadowless", label: "Shadowless" },
  { id: "unlimited", label: "Unlimited" },
  { id: "unknown", label: "Unknown" },
] as const;

export const CONDITIONS = [
  "NM",
  "LP",
  "MP",
  "HP",
  "DMG",
  "PSA 10",
  "PSA 9",
  "PSA 8",
  "BGS 10",
  "BGS 9.5",
  "CGC 10",
] as const;

export function normalizeVariant(value: string | undefined | null): string {
  const text = (value || "").trim().toLowerCase();
  if (!text || text === "unknown") return "unknown";
  if (text.includes("reverse")) return "reverse holo";
  if (text.includes("shadowless")) return "shadowless";
  if ((text.includes("1st") || text.includes("first edition")) && text.includes("holo")) {
    return "1st edition holo";
  }
  if (text.includes("1st") || text.includes("first edition")) return "1st edition";
  if (text.includes("unlimited")) return "unlimited";
  if (text === "normal" || text === "standard" || text.includes("non-holo")) return "standard";
  if (text.includes("holo")) return "holo";
  return text.slice(0, 40);
}

export function variantLabel(value: string | undefined | null): string {
  const id = normalizeVariant(value);
  return VARIANTS.find((item) => item.id === id)?.label ?? id;
}

export function normalizeCondition(value: string | undefined | null): string {
  const text = (value || "").trim().replace(/\s+/g, " ");
  if (!text) return "NM";
  const known = CONDITIONS.find((item) => item.toLowerCase() === text.toLowerCase());
  return (known ?? text).slice(0, 40);
}

export function isGradedCondition(condition: string | undefined | null): boolean {
  return /\b(PSA|BGS|CGC|SGC|ACE|TAG)\b/i.test(condition || "");
}

export function normalizeLanguage(value: string | undefined | null): "English" | "Japanese" | "Other" {
  const text = (value || "").trim().toLowerCase();
  if (text.startsWith("jap")) return "Japanese";
  if (text === "other") return "Other";
  return "English";
}
