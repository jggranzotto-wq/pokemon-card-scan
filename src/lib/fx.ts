const FALLBACK_RATE = 1.37;
let cache: { rate: number; label: string; at: number } | null = null;

export async function usdCadRate(): Promise<{ rate: number; label: string }> {
  const override = Number(process.env.USD_CAD_RATE);
  if (Number.isFinite(override) && override > 0) {
    return { rate: override, label: `approx CAD at ${override} (env)` };
  }

  if (cache && Date.now() - cache.at < 12 * 60 * 60 * 1000) {
    return { rate: cache.rate, label: cache.label };
  }

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=CAD", {
      next: { revalidate: 60 * 60 * 12 },
    });
    if (res.ok) {
      const data = (await res.json()) as { rates?: { CAD?: number }; date?: string };
      const rate = data.rates?.CAD;
      if (rate && rate > 0) {
        const label = `approx CAD (Frankfurter ${data.date ?? "daily"})`;
        cache = { rate, label, at: Date.now() };
        return { rate, label };
      }
    }
  } catch {
    // use fallback
  }

  cache = {
    rate: FALLBACK_RATE,
    label: `approx CAD at ${FALLBACK_RATE} (fallback FX)`,
    at: Date.now(),
  };
  return { rate: FALLBACK_RATE, label: cache.label };
}
