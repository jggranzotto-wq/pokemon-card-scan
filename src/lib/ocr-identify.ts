import { broadPoolCandidates } from "./broad-pool";
import { writeCardDetails } from "./image-hash-cache";
import { catalogHashDistances, photoArtSignature } from "./image-match";
import { decideOcrIdentification, needsBroadPool, OCR_UNCLEAR_MESSAGE, variantHashPriority } from "./ocr-match";
import { lookupCatalogCard, lookupOcrCandidates } from "./pokemon-tcg";
import type { ExtractedCard, IdentifyResponse, PokemonCard } from "../types/card";

function bestDistance(distances: Map<string, number> | null): number | null {
  if (!distances?.size) return null;
  let best = Number.POSITIVE_INFINITY;
  for (const distance of distances.values()) {
    if (distance < best) best = distance;
  }
  return Number.isFinite(best) ? best : null;
}

function mergeCards(base: PokemonCard[], extra: PokemonCard[]): PokemonCard[] {
  const seen = new Set(base.map((card) => card.id));
  const out = [...base];
  for (const card of extra) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

async function hydrateStubs(
  cards: PokemonCard[],
  distances: Map<string, number>,
  hydrate: (id: string) => Promise<PokemonCard | null>,
): Promise<PokemonCard[]> {
  const top = [...distances.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 8)
    .map(([id]) => id);
  const replacements = new Map<string, PokemonCard>();
  await Promise.all(
    top.map(async (id) => {
      const card = cards.find((row) => row.id === id);
      if (!card || card.name !== card.id) return;
      const detail = await hydrate(id);
      if (!detail || detail.name === id) return;
      const next = {
        ...detail,
        images: detail.images?.small || detail.images?.large ? detail.images : card.images,
      };
      replacements.set(id, next);
      await writeCardDetails(next);
    }),
  );
  if (!replacements.size) return cards;
  return cards.map((card) => replacements.get(card.id) ?? card);
}

export async function identifyOcrPhoto(input: {
  extracted: ExtractedCard;
  photo?: Buffer | null;
  notice?: string | null;
  visionAvailable?: boolean;
  lookup?: (extracted: ExtractedCard) => Promise<PokemonCard[]>;
  distancesFor?: (photo: Buffer, cards: PokemonCard[]) => Promise<Map<string, number>>;
  loadBroadCards?: () => Promise<PokemonCard[]>;
  hydrate?: (id: string) => Promise<PokemonCard | null>;
}): Promise<IdentifyResponse> {
  const lookup = input.lookup ?? lookupOcrCandidates;
  const cards = await lookup(input.extracted);
  const ordered = [...cards].sort((a, b) => variantHashPriority(a.name) - variantHashPriority(b.name));
  const photo = input.photo && input.photo.length ? input.photo : null;
  let sharedHash: string | null = null;
  const distancesFor =
    input.distancesFor ??
    (async (buffer: Buffer, rows: PokemonCard[]) => {
      sharedHash ??= await photoArtSignature(buffer);
      return catalogHashDistances(buffer, rows, { photoHash: sharedHash });
    });
  const distances = photo ? await distancesFor(photo, ordered) : null;

  let pool = ordered;
  let imageOverride = false;
  if (photo && distances && needsBroadPool(input.extracted, bestDistance(distances))) {
    const seen = new Set(pool.map((card) => card.id));
    let extra: PokemonCard[] = [];
    if (input.loadBroadCards) {
      extra = await input.loadBroadCards();
    } else {
      sharedHash ??= await photoArtSignature(photo);
      const broad = await broadPoolCandidates(sharedHash, new Set(distances.keys()));
      for (const [id, distance] of broad.distances) distances.set(id, distance);
      extra = broad.cards;
    }
    const unseen = extra.filter((card) => !seen.has(card.id));
    const toHash = unseen.filter((card) => !distances.has(card.id));
    if (toHash.length) {
      const more = await distancesFor(photo, toHash);
      for (const [id, distance] of more) distances.set(id, distance);
    }
    pool = mergeCards(pool, unseen);
    pool = await hydrateStubs(pool, distances, input.hydrate ?? lookupCatalogCard);
    imageOverride = true;
    console.info(`[identify] broad pool compared ${pool.length} cards`);
  }

  const decision = decideOcrIdentification({
    extracted: input.extracted,
    cards: pool,
    distances,
    imageOverride,
  });
  if (decision.autoSelectedId) {
    const distance = distances?.get(decision.autoSelectedId);
    console.info(
      `[identify] image match ${decision.autoSelectedId} distance=${distance ?? "n/a"} score=${decision.candidates.find((card) => card.id === decision.autoSelectedId)?.imageScore ?? "n/a"} auto=true`,
    );
  } else if (decision.candidates.length) {
    console.info(`[identify] image match showing ${decision.candidates.length} cards`);
  }

  return {
    method: "ocr",
    extracted: input.extracted,
    candidates: decision.candidates,
    autoSelectedId: decision.autoSelectedId,
    visionAvailable: input.visionAvailable ?? false,
    message: decision.message ?? (decision.candidates.length ? undefined : OCR_UNCLEAR_MESSAGE),
    notice: input.notice || undefined,
  };
}
