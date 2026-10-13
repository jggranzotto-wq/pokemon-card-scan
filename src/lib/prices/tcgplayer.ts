import { printingLabel, pickVariantPrice, type MarketRow } from "./printing";
import { closedQuote, errorQuote, okQuote, type PriceInput, type PriceQuote } from "./types";

const POKEMONTCG = "https://api.pokemontcg.io/v2";

type RawCard = {
  id: string;
  name: string;
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, MarketRow>;
  };
};

function headers(env: NodeJS.ProcessEnv): HeadersInit {
  const key = env.POKEMONTCG_API_KEY?.trim();
  const base = { "User-Agent": "pokemon-card-scan/1.0", Accept: "application/json" };
  return key ? { ...base, "X-Api-Key": key } : base;
}

async function fetchCard(url: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<RawCard | null> {
  const response = await fetchImpl(url, { headers: headers(env), cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`pokemontcg.io failed (${response.status}).`);
  const body = (await response.json()) as { data?: RawCard | RawCard[] };
  if (Array.isArray(body.data)) return body.data[0] ?? null;
  return body.data ?? null;
}

function quoteFromCard(card: RawCard, input: PriceInput): PriceQuote {
  const picked = pickVariantPrice(card.tcgplayer?.prices, input.variant);
  if (!picked) {
    return closedQuote(
      "tcgplayer",
      "unavailable",
      "No TCGPlayer market price",
      "pokemontcg.io has no TCGPlayer market snapshot for this printing. Nothing was invented.",
    );
  }
  const updated = card.tcgplayer?.updatedAt;
  return okQuote(
    "tcgplayer",
    picked.market,
    `TCGPlayer market · ${printingLabel(picked.key)}`,
    updated ? `Catalog snapshot ${updated}. Source: pokemontcg.io (no paid TCGPlayer key).` : "Source: pokemontcg.io.",
  );
}

export async function quoteTcgplayer(
  input: PriceInput,
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<PriceQuote> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  try {
    if (input.catalogId) {
      const card = await fetchCard(`${POKEMONTCG}/cards/${encodeURIComponent(input.catalogId)}`, env, fetchImpl);
      if (!card) {
        return closedQuote("tcgplayer", "unavailable", "No TCGPlayer market price", "That catalog id was not found on pokemontcg.io.");
      }
      return quoteFromCard(card, input);
    }

    const name = input.name.trim();
    if (!name) return closedQuote("tcgplayer", "unavailable", "No TCGPlayer market price", "Need a card name.");
    const parts = [`name:"${name.replace(/"/g, "")}"`];
    if (input.number) parts.push(`number:"${input.number.replace(/"/g, "")}"`);
    if (input.setId) parts.push(`set.id:${input.setId}`);
    const params = new URLSearchParams({ q: parts.join(" "), pageSize: "4" });
    const card = await fetchCard(`${POKEMONTCG}/cards?${params.toString()}`, env, fetchImpl);
    if (!card) {
      return closedQuote("tcgplayer", "unavailable", "No TCGPlayer market price", "No pokemontcg.io card matched this name.");
    }
    return quoteFromCard(card, input);
  } catch (error) {
    return errorQuote("tcgplayer", error);
  }
}
