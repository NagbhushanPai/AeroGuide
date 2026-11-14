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

/** "Bengaluru (BLR)", or the bare code when we don't know the airport. */
export function airportLabel(iata: string, airports: readonly MapAirport[] | undefined): string {
  const a = airports?.find((x) => x.iata === iata);
  return a ? `${a.city ?? a.name} (${a.iata})` : iata;
}

type ComboboxProps = {
  /** Called when an airport is picked from the list. */
  onSelect: (airport: MapAirport) => void;
  /** Visible or screen-reader label for the input. */
  label: string;
  labelHidden?: boolean;
  placeholder?: string;
  /** Text shown in the input when the person isn't typing (the current choice). */
  display?: string;
  /** Called with the raw text as the person types. */
  onTextChange?: (text: string) => void;
  onBlur?: () => void;
  clearOnSelect?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
};

/**
 * Combobox over the map's airports layer (works without the API): type a code, city or name,
 * pick with the arrow keys and Enter, or with a tap.
 */
export function AirportCombobox({
  onSelect,
  label,
  labelHidden = false,
  placeholder = "Find an airport…",
  display = "",
  onTextChange,
  onBlur,
  clearOnSelect = false,
  invalid,
  describedBy,
  className,
  inputClassName,
  id,
}: ComboboxProps) {
  const airports = useMapAirports();
  // null: not typing, show `display`.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;

  const query = typed ?? "";
  const results = useMemo(
    () => searchMapAirports(airports.data ?? [], query),
    [airports.data, query],
  );
  const showList = open && query.trim().length > 0;
  const value = typed ?? display;

  function setText(text: string) {
    setTyped(text);
    setActive(0);
    setOpen(true);
    onTextChange?.(text);
  }

  function choose(a: MapAirport) {
    onSelect(a);
    setTyped(clearOnSelect ? "" : null);
    if (clearOnSelect) onTextChange?.("");
    setOpen(false);
    if (clearOnSelect) inputRef.current?.blur();
  }

  return (
    <div className={cn("relative", className)}>
      <label
        htmlFor={inputId}
        className={labelHidden ? "sr-only" : "mb-1 block text-sm font-medium"}
      >
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
            if (!clearOnSelect) {
              // An empty box, or an exact code, shows the current choice ("Delhi (DEL)").
              setTyped((t) =>
                t === null ||
                t.trim() === "" ||
                airports.data?.some((a) => a.iata === t.trim().toUpperCase())
                  ? null
                  : t,
              );
            }
            onBlur?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && showList && results[active]) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape" && (showList || typed)) {
              e.preventDefault();
              setOpen(false);
              if (clearOnSelect) setText("");
            }
          }}
          placeholder={placeholder}
          className={cn(
            "w-full border bg-background pr-8 pl-8 outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
            inputClassName ?? "h-10 rounded-md text-base sm:text-sm",
          )}
        />
        {value ? (
          <button
            type="button"
            aria-label={clearOnSelect ? "Clear airport search" : `Clear ${label.toLowerCase()}`}
            onClick={() => {
              setText("");
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Airports"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {airports.isError ? (
            <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">
              Couldn&apos;t load airports.
            </li>
          ) : results.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">
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
                  "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
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

/** The live map's airport finder: picks an airport and clears itself. */
export function AirportSearch({
  onSelect,
  className,
}: {
  onSelect: (airport: MapAirport) => void;
  className?: string;
}) {
  return (
    <AirportCombobox
      onSelect={onSelect}
      label="Search airports"
      labelHidden
      clearOnSelect
      className={className}
      inputClassName="h-8 rounded-full bg-background/90 text-sm backdrop-blur"
    />
  );
}
