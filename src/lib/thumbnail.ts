const ALLOWED_IMAGE_HOSTS = new Set(["images.pokemontcg.io", "assets.tcgdex.net"]);

export function decodeThumbnail(input: string | undefined | null): { bytes: Buffer; mime: string } | null {
  if (!input?.trim()) return null;
  const match = input.trim().match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  const mime = match?.[1] ?? "image/jpeg";
  const b64 = (match?.[2] ?? input).replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 32 || bytes.length > 600_000) {
    throw new Error("The photo thumbnail must be under 600 KB.");
  }
  return { bytes, mime };
}

export async function fetchCatalogThumbnail(url: string | null | undefined): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) return null;
  const response = await fetch(parsed, { cache: "no-store" });
  if (!response.ok) return null;
  const mime = (response.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  if (!mime.startsWith("image/")) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 32 || bytes.length > 600_000) return null;
  return { bytes, mime };
}
