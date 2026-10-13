"use client";

export default function ScanError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-phone px-4 py-8">
      <h1 className="text-2xl font-semibold">Scan hit a problem</h1>
      <p className="mt-3 rounded-2xl bg-coral/15 px-4 py-3 text-sm text-coral" role="alert">
        {error.message || "Something went wrong showing that result."} A result already returned is kept in this tab.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 min-h-12 w-full rounded-2xl bg-bolt font-semibold text-ink"
      >
        Try the scan page again
      </button>
    </main>
  );
}
