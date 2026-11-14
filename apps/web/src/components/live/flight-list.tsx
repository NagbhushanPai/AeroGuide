"use client";

import { ArrowRight, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";

import type { AircraftFeature } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import { MISSING } from "@/lib/copy";

import { displayName, formatAltitude, hasCallsign, typeName } from "./format";

const PAGE = 100;

type Props = {
  features: AircraftFeature[];
  selected: string | null;
  onSelect: (feature: AircraftFeature) => void;
  isWatched: (icao24: string) => boolean;
  onToggleWatch: (icao24: string, label: string) => void;
};

export function matchesQuery(f: AircraftFeature, q: string): boolean {
  if (!q) return true;
  const p = f.properties;
  const hay = [
    p.callsign,
    p.flight_number,
    p.registration,
    p.type_code,
    p.icao24,
    p.origin_iata,
    p.destination_iata,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term));
}

export function FlightList({ features, selected, onSelect, isWatched, onToggleWatch }: Props) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);

  // Airports that appear in known routes, for the From/To filters.
  const { origins, destinations, withRoute } = useMemo(() => {
    const o = new Set<string>();
    const d = new Set<string>();
    let n = 0;
    for (const f of features) {
      if (f.properties.origin_iata) o.add(f.properties.origin_iata);
      if (f.properties.destination_iata) d.add(f.properties.destination_iata);
      if (f.properties.origin_iata && f.properties.destination_iata) n++;
    }
    return { origins: [...o].sort(), destinations: [...d].sort(), withRoute: n };
  }, [features]);

  const filtered = useMemo(() => {
    return features
      .filter((f) => matchesQuery(f, query.trim()))
      .filter((f) => !from || f.properties.origin_iata === from)
      .filter((f) => !to || f.properties.destination_iata === to)
      .sort((a, b) => {
        // Watched first, then flights with a callsign (or flight number), then the rest, which
        // are shown by registration or hex code; alphabetical within each group.
        const w = Number(isWatched(b.id)) - Number(isWatched(a.id));
        if (w) return w;
        const c = Number(hasCallsign(b.properties)) - Number(hasCallsign(a.properties));
        if (c) return c;
        return displayName(a.properties).localeCompare(displayName(b.properties));
      });
  }, [features, query, from, to, isWatched]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="grid grid-cols-2 gap-2">
          <AirportSelect label="From" value={from} options={origins} onChange={setFrom} />
          <AirportSelect label="To" value={to} options={destinations} onChange={setTo} />
        </div>
        <label className="relative block">
          <span className="sr-only">Search flights</span>
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Callsign, flight, registration, type…"
            className="h-9 w-full rounded-md border bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {filtered.length.toLocaleString("en-IN")} shown · {withRoute.toLocaleString("en-IN")} with
          a reported route
          {(from || to) && " (From/To only matches flights with a reported route)"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No aircraft match these filters.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto" aria-label="Aircraft">
          {filtered.slice(0, limit).map((f) => (
            <FlightRow
              key={f.id}
              feature={f}
              selected={f.id === selected}
              watched={isWatched(f.id)}
              onSelect={() => onSelect(f)}
              onToggleWatch={() => onToggleWatch(f.id, displayName(f.properties))}
            />
          ))}
          {filtered.length > limit ? (
            <li className="p-3">
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE)}
                className="w-full rounded-md border py-2 text-sm hover:bg-muted"
              >
                Show more ({(filtered.length - limit).toLocaleString("en-IN")} remaining)
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function AirportSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label} airport</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">{label}: any</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {label}: {code}
          </option>
        ))}
      </select>
    </label>
  );
}

function FlightRow({
  feature,
  selected,
  watched,
  onSelect,
  onToggleWatch,
}: {
  feature: AircraftFeature;
  selected: boolean;
  watched: boolean;
  onSelect: () => void;
  onToggleWatch: () => void;
}) {
  const p = feature.properties;
  const name = displayName(p);
  return (
    <li className={cn("flex items-stretch", selected && "bg-muted")}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="min-w-0 flex-1 px-3 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-sm font-semibold">{name}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {formatAltitude(p.alt_baro_ft, p.on_ground) ?? (
              <span className="font-sans italic">Altitude: {MISSING.notAvailable}</span>
            )}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {p.origin_iata && p.destination_iata ? (
            <span className="inline-flex items-center gap-1 font-mono text-foreground">
              {p.origin_iata} <ArrowRight aria-label="to" className="size-3" /> {p.destination_iata}
            </span>
          ) : (
            <span className="italic">Route not reported</span>
          )}
          <span aria-hidden="true">·</span>
          <span className="truncate">
            {typeName(p.type_code) ?? <span className="italic">Type: {MISSING.notAvailable}</span>}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleWatch}
        aria-pressed={watched}
        aria-label={watched ? `Stop watching ${name}` : `Watch ${name}`}
        title={watched ? "Stop watching" : "Watch for take-off and landing"}
        className="px-3 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
      >
        <Star aria-hidden="true" className={cn("size-4", watched && "fill-warning text-warning")} />
      </button>
    </li>
  );
}
