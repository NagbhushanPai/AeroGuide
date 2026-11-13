"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { loadMapAirports, searchMapAirports, type MapAirport } from "@/lib/airports";
import { cn } from "@/lib/utils";

export function useMapAirports() {
  return useQuery({
    queryKey: ["map-airports"],
    queryFn: ({ signal }) => loadMapAirports(signal),
    staleTime: Infinity, // static file, rebuilt with the site
  });
}

/** Combobox over the map's airports layer: type a code, city or name, pick with keys or mouse. */
export function AirportSearch({
  onSelect,
  className,
}: {
  onSelect: (airport: MapAirport) => void;
  className?: string;
}) {
  const airports = useMapAirports();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(
    () => searchMapAirports(airports.data ?? [], query),
    [airports.data, query],
  );
  const showList = open && query.trim().length > 0;

  function choose(a: MapAirport) {
    onSelect(a);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className={cn("relative", className)}>
      <label className="relative block">
        <span className="sr-only">Search airports</span>
        <Search
          aria-hidden="true"
          className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") {
              setQuery("");
              setOpen(false);
            }
          }}
          placeholder="Find an airport…"
          className="h-8 w-full rounded-full border bg-background/90 pr-8 pl-8 text-sm backdrop-blur outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear airport search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </label>
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Airports"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {airports.isError ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Couldn&apos;t load airports.
            </li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {airports.data ? "No airports match." : "Loading airports…"}
            </li>
          ) : (
            results.map((a, i) => (
              <li
                key={a.iata}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()} // keep focus so blur doesn't close first
                onClick={() => choose(a)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  i === active && "bg-muted",
                )}
              >
                <Building2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="w-9 font-mono font-semibold text-primary">{a.iata}</span>
                <span className="min-w-0 flex-1 truncate">
                  {a.city ? `${a.city} · ` : ""}
                  <span className="text-muted-foreground">{a.name}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
