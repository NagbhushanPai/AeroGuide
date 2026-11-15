"use client";

import { Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import type { MapAirport } from "@/lib/airports";
import { cn } from "@/lib/utils";

export type RouteAirport = { code: string; flights: number };

type Props = {
  /** "From" or "To". */
  label: string;
  /** Selected IATA code, or "" for any. */
  value: string;
  /** Airports that appear in the reported routes, with how many flights use each. */
  options: readonly RouteAirport[];
  /** Indian airports, for city and airport names (other airports show their code only). */
  airports: readonly MapAirport[] | undefined;
  onChange: (code: string) => void;
};

function describe(code: string, airports: readonly MapAirport[] | undefined): string {
  const a = airports?.find((x) => x.iata === code);
  return a ? (a.city ?? a.name) : "";
}

/**
 * Searchable From/To filter for the live flight list: type a code or a city, pick with the
 * arrow keys and Enter, or tap. Lists only airports in the current reported routes, busiest
 * first, so every choice matches at least one flight.
 */
export function RouteAirportFilter({ label, value, options, airports, onChange }: Props) {
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;

  const query = (typed ?? "").trim().toLowerCase();
  const results = useMemo(() => {
    const ranked = options
      .map((o) => ({ ...o, place: describe(o.code, airports) }))
      .filter(
        (o) =>
          !query || o.code.toLowerCase().startsWith(query) || o.place.toLowerCase().includes(query),
      )
      .sort((a, b) => {
        // An exact code first, then the busiest.
        const exact =
          Number(b.code.toLowerCase() === query) - Number(a.code.toLowerCase() === query);
        return exact || b.flights - a.flights || a.code.localeCompare(b.code);
      });
    return ranked;
  }, [options, airports, query]);

  const selectedPlace = value ? describe(value, airports) : "";
  const display = value ? `${label}: ${value}${selectedPlace ? ` · ${selectedPlace}` : ""}` : "";
  const shown = typed ?? display;

  function choose(code: string) {
    onChange(code);
    setTyped(null);
    setOpen(false);
  }

  return (
    <div className="relative min-w-0">
      <label htmlFor={`${id}-input`} className="sr-only">
        {label} airport
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={shown}
          placeholder={`${label}: any`}
          onChange={(e) => {
            setTyped(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
            setTyped(null); // show the current choice again
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && open && results[active]) {
              e.preventDefault();
              choose(results[active].code);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              setOpen(false);
              setTyped(null);
            }
          }}
          className="h-9 w-full truncate rounded-md border bg-background pr-7 pl-7 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
        />
        {value ? (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()} filter`}
            onClick={() => {
              choose("");
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-0.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} airports`}
          className="absolute top-full left-0 z-30 mt-1 max-h-72 w-[max(100%,16rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {results.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">
              {options.length === 0
                ? "No flights with a reported route yet."
                : "No airport in the current routes matches."}
            </li>
          ) : (
            results.map((o, i) => (
              <li
                key={o.code}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.code === value}
                onMouseDown={(e) => e.preventDefault()} // keep focus so blur doesn't close first
                onClick={() => choose(o.code)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  i === active && "bg-muted",
                )}
              >
                <span className="w-9 font-mono font-semibold text-primary">{o.code}</span>
                <span className="min-w-0 flex-1 truncate">{o.place}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {o.flights} {o.flights === 1 ? "flight" : "flights"}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
