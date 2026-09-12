export type CardLanguage = "English" | "Japanese" | "Other";

export type CardVariant =
  | "holo"
  | "reverse"
  | "1st edition"
  | "shadowless"
  | "unlimited"
  | "standard"
  | "unknown";

export type ExtractedCard = {
  name?: string;
  set?: string;
  collectorNumber?: string;
  printedTotal?: string;
  variant?: CardVariant;
  language?: CardLanguage;
  isSlab?: boolean;
  grade?: string | null;
  confidence?: number;
  ocrText?: string;
  /** Printed © year from the photo. Used only when official set year is missing. */
  copyrightYear?: number | null;
};

export type PokemonCard = {
  id: string;
  name: string;
  setName: string;
  setId: string;
  setSeries?: string;
  number: string;
  printedNumber: string;
  rarity?: string;
  /** Official set release year from pokemontcg.io / TCGdex. Null if unknown. */
  setYear?: number | null;
  artist?: string;
  language: CardLanguage;
  images: { small?: string; large?: string };
  variantHints: string[];
  tcgplayer?: {
    url?: string;
    marketUsd?: number;
    lowUsd?: number;
    highUsd?: number;
    updatedAt?: string;
  };
};

export type IdentifyResponse = {
  method: "vision" | "ocr" | "text";
  extracted: ExtractedCard;
  candidates: PokemonCard[];
  autoSelectedId?: string;
  visionAvailable: boolean;
  message?: string;
};

export type GradeLabel = string;

export type SoldListing = {
  id: string;
  title: string;
  priceUsd: number;
  soldAt: string;
  grade: GradeLabel;
  isGraded: boolean;
  url?: string;
  image?: string;
};

export type PriceBand = {
  count: number;
  min: number;
  max: number;
  median: number;
  typicalLow: number;
  typicalHigh: number;
};

export type SoldsResponse = {
  source: "ebay" | "example";
  sourceLabel: string;
  demo: boolean;
  usdCadRate: number;
  rateLabel: string;
  query: string;
  ebaySearchUrl: string;
  sales: SoldListing[];
  raw: PriceBand | null;
  graded: PriceBand | null;
  typical: PriceBand | null;
  tcgplayer?: PokemonCard["tcgplayer"];
};

export type StatusResponse = {
  vision: boolean;
  visionProvider?: "openai" | "gemini";
  ebay: boolean;
  pokemonTcgKey: boolean;
};
