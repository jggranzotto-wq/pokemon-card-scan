"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-origin";
import { filterSetsByYear, mergeNameSuggestions } from "@/lib/catalog";
import type { CatalogSet } from "@/types/card";

type CatalogPayload = { years: number[]; sets: CatalogSet[] };

export function ManualIdentify({
  busy,
  onSearch,
}: {
  busy?: boolean;
  onSearch: (input: { name: string; year?: number; setName?: string; setId?: string; number?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [setId, setSetId] = useState("");
  const [number, setNumber] = useState("");
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    void fetch(apiUrl("/api/catalog"), { cache: "no-store" })
      .then((res) => res.json())
      .then((data: CatalogPayload) => {
        if (Array.isArray(data.sets)) setCatalog(data);
      })
      .catch(() => setCatalog({ years: [], sets: [] }));
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = name.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    setSuggestions(mergeNameSuggestions(q, []));
    debounceRef.current = window.setTimeout(() => {
      void fetch(apiUrl(`/api/catalog/suggest?q=${encodeURIComponent(q)}`), { cache: "no-store" })
        .then((res) => res.json())
        .then((data: { names?: string[] }) => {
          if (Array.isArray(data.names)) setSuggestions(data.names);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [name]);

  const yearValue = year ? Number(year) : undefined;
  const setsForYear = useMemo(
    () => filterSetsByYear(catalog?.sets ?? [], yearValue),
    [catalog, yearValue],
  );

  useEffect(() => {
    if (setId && !setsForYear.some((set) => set.id === setId)) setSetId("");
  }, [setId, setsForYear]);

  const selectedSet = setsForYear.find((set) => set.id === setId);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setOpenSuggest(false);
    onSearch({
      name: trimmed,
      year: yearValue,
      setName: selectedSet?.name,
      setId: selectedSet?.id,
      number: number.trim() || undefined,
    });
  }

  return (
    <section className="mt-5 rounded-3xl bg-ink-card p-4 ring-1 ring-ink-line">
      <h2 className="text-base font-semibold">Find by name</h2>
      <p className="mt-1 text-sm text-paper-mute">
        Type the Pokémon or card name. Photo is optional — use year and set when you know them.
      </p>

      <form onSubmit={submit} className="mt-4 grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Name</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setOpenSuggest(true);
            }}
            onFocus={() => setOpenSuggest(true)}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="Charizard, Pikachu, Charizard VMAX…"
            className="min-h-12 rounded-2xl bg-ink-raised px-4 text-base ring-1 ring-ink-line outline-none placeholder:text-paper-mute"
          />
        </label>
        {openSuggest && suggestions.length > 0 ? (
          <ul className="max-h-48 overflow-auto rounded-2xl bg-ink-raised ring-1 ring-ink-line">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => {
                    setName(suggestion);
                    setOpenSuggest(false);
                  }}
                  className="flex min-h-12 w-full items-center px-4 text-left text-base active:bg-sky/20"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Year</span>
          <select
            value={year}
            onChange={(event) => setYear(event.target.value)}
            className="min-h-12 rounded-2xl bg-ink-raised px-4 text-base ring-1 ring-ink-line outline-none"
          >
            <option value="">Any year</option>
            {(catalog?.years ?? []).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Set</span>
          <select
            value={setId}
            onChange={(event) => setSetId(event.target.value)}
            className="min-h-12 rounded-2xl bg-ink-raised px-4 text-base ring-1 ring-ink-line outline-none"
          >
            <option value="">Any set</option>
            {setsForYear.map((set) => (
              <option key={set.id} value={set.id}>
                {yearValue ? set.name : set.year ? `${set.name} (${set.year})` : set.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">
            Collector number <span className="font-normal text-paper-mute">(optional)</span>
          </span>
          <input
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="4 or 4/102"
            className="min-h-12 rounded-2xl bg-ink-raised px-4 text-base ring-1 ring-ink-line outline-none placeholder:text-paper-mute"
          />
        </label>

        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="min-h-14 rounded-2xl bg-sky px-4 text-lg font-semibold text-white active:scale-[0.99] disabled:opacity-50"
        >
          Find this card
        </button>
      </form>
    </section>
  );
}
