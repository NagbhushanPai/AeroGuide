"use client";

import { ExternalLink, GitPullRequest, Search, Sofa } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { VerificationStatus } from "@/components/data/verification-status";
import { WakingMessage } from "@/components/data/waking-message";
import { FilterChip } from "@/components/search/filter-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LoungeSummary } from "@/lib/api/client";
import type { VerificationState } from "@/lib/freshness";
import {
  directionLabel,
  filterLounges,
  groupLoungesByAirport,
  readLoungeFilters,
  scopeLabel,
  sideLabel,
  type LoungeFilters,
} from "@/lib/lounges";
import { siteConfig } from "@/lib/site";
import { replaceParams } from "@/lib/url-state";

import { useLounges } from "./use-lounges";

const DEBOUNCE_MS = 200;
const selectClass =
  "h-10 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm";

export function ContributeButton({ label = "How to add one" }: { label?: string }) {
  return (
    <Button asChild variant="outline">
      <a href={siteConfig.contributeUrl} target="_blank" rel="noopener noreferrer">
        <GitPullRequest aria-hidden="true" /> {label} <ExternalLink aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Button>
  );
}

export function LoungeCard({
  lounge: l,
  showAirport = true,
}: {
  lounge: LoungeSummary;
  showAirport?: boolean;
}) {
  const notDepartures = l.direction !== "departures";
  return (
    <Link
      href={`/lounges/${l.slug}`}
      className="group block h-full rounded-xl border bg-card p-4 transition-colors outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <p className="text-xs text-muted-foreground">
        {showAirport ? <span className="font-mono text-primary">{l.iata}</span> : null}
        {showAirport && l.terminal ? " · " : ""}
        {l.terminal ?? (showAirport ? "" : "Terminal not stated")}
      </p>
      <p className="mt-0.5 font-medium group-hover:underline">{l.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {notDepartures ? (
          <Badge variant="secondary" className="font-semibold">
            {directionLabel(l.direction)}
          </Badge>
        ) : null}
        <Badge variant="outline">{scopeLabel(l.scope)}</Badge>
        <Badge variant="outline">{sideLabel(l.side)}</Badge>
        <VerificationStatus status={l.status as VerificationState} />
      </div>
      {l.programs.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Accepts: {l.programs.map((p) => p.name).join(", ")}
        </p>
      ) : null}
    </Link>
  );
}

function LoadingLounges({ waking }: { waking: boolean }) {
  return (
    <div aria-busy="true" className="space-y-3">
      {waking ? (
        <WakingMessage />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Loading lounges…
        </p>
      )}
      <Skeleton className="h-28 rounded-xl" />
    </div>
  );
}

/** All lounges we have records for, filtered from the URL and grouped by airport. */
export function LoungeDirectory() {
  const lounges = useLounges();
  const params = useSearchParams();
  const id = useId();
  const filters = readLoungeFilters(params);
  const [text, setText] = useState(filters.q);

  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== filters.q) replaceParams({ q: text.trim() || null });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // Only typing starts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const items = useMemo(() => lounges.data?.items ?? [], [lounges.data]);
  const airports = useMemo(() => groupLoungesByAirport(items), [items]);
  const programs = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of items) for (const p of l.programs) m.set(p.key, p.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);
  const terminals = useMemo(
    () =>
      filters.airport
        ? [
            ...new Set(
              items
                .filter((l) => l.iata === filters.airport && l.terminal)
                .map((l) => l.terminal as string),
            ),
          ].sort()
        : [],
    [items, filters.airport],
  );

  if (lounges.isError && !lounges.data) {
    return (
      <ErrorState
        title="Couldn't load lounges"
        description="The data service didn't respond. It may still be starting up."
        onRetry={() => void lounges.refetch()}
      />
    );
  }
  if (!lounges.data) return <LoadingLounges waking={lounges.waking} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sofa}
        title="No lounges recorded yet"
        description={
          <>
            Every lounge here must come from the lounge operator&apos;s or airport&apos;s own page,
            checked by a person, so the list starts empty rather than guessed. Lounges are added
            through reviewed pull requests.
          </>
        }
      >
        <ContributeButton label="Add a lounge" />
      </EmptyState>
    );
  }

  const filtered = filterLounges(items, filters);
  const groups = groupLoungesByAirport(filtered);
  const filtering = Object.values(filters).some(Boolean);
  const set = (patch: Partial<Record<keyof LoungeFilters, string | null>>) => replaceParams(patch);

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <label className="relative block self-end">
            <span className="sr-only">Search lounges</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Lounge, city or airport"
              className="h-10 w-full rounded-md border bg-background pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
            />
          </label>
          <div>
            <label htmlFor={`${id}-airport`} className="mb-1 block text-xs text-muted-foreground">
              Airport
            </label>
            <select
              id={`${id}-airport`}
              value={filters.airport}
              onChange={(e) => set({ airport: e.target.value || null, terminal: null })}
              className={selectClass}
            >
              <option value="">All airports ({airports.length})</option>
              {filters.airport && !airports.some((a) => a.iata === filters.airport) ? (
                <option value={filters.airport}>{filters.airport}</option>
              ) : null}
              {airports.map((a) => (
                <option key={a.iata} value={a.iata}>
                  {a.city ?? a.airportName} ({a.iata})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-program`} className="mb-1 block text-xs text-muted-foreground">
              Programme
            </label>
            <select
              id={`${id}-program`}
              value={filters.program}
              onChange={(e) => set({ program: e.target.value || null })}
              className={selectClass}
            >
              <option value="">Any programme</option>
              {programs.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Flight">
          <FilterChip pressed={!filters.scope} onClick={() => set({ scope: null })}>
            All flights
          </FilterChip>
          <FilterChip
            pressed={filters.scope === "domestic"}
            onClick={() => set({ scope: filters.scope === "domestic" ? null : "domestic" })}
          >
            Domestic
          </FilterChip>
          <FilterChip
            pressed={filters.scope === "international"}
            onClick={() =>
              set({ scope: filters.scope === "international" ? null : "international" })
            }
          >
            International
          </FilterChip>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <FilterChip
            pressed={filters.side === "airside"}
            onClick={() => set({ side: filters.side === "airside" ? null : "airside" })}
          >
            After security
          </FilterChip>
          <FilterChip
            pressed={filters.side === "landside"}
            onClick={() => set({ side: filters.side === "landside" ? null : "landside" })}
          >
            Before security
          </FilterChip>
        </div>
        {terminals.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Terminal">
            <FilterChip pressed={!filters.terminal} onClick={() => set({ terminal: null })}>
              All terminals
            </FilterChip>
            {terminals.map((t) => (
              <FilterChip
                key={t}
                pressed={filters.terminal === t}
                onClick={() => set({ terminal: filters.terminal === t ? null : t })}
              >
                {t}
              </FilterChip>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            {filtering
              ? `${filtered.length} of ${items.length} lounges`
              : `${items.length} lounges at ${airports.length} airports`}
          </p>
          {filtering ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setText("");
                replaceParams({
                  q: null,
                  airport: null,
                  terminal: null,
                  side: null,
                  scope: null,
                  program: null,
                });
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          {filters.airport && !airports.some((a) => a.iata === filters.airport)
            ? `We have no lounges recorded at ${filters.airport} yet.`
            : "No lounges match these filters."}
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.iata} aria-labelledby={`lounges-${g.iata}`}>
              <h2 id={`lounges-${g.iata}`} className="mb-3 font-semibold">
                <Link href={`/airports/${g.iata}`} className="hover:underline">
                  {g.city ? `${g.city} · ` : ""}
                  {g.airportName} <span className="font-mono text-primary">({g.iata})</span>
                </Link>{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {g.lounges.length} lounge{g.lounges.length === 1 ? "" : "s"}
                </span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.lounges.map((l) => (
                  <li key={l.slug}>
                    <LoungeCard lounge={l} showAirport={false} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lounges section on an airport guide. */
export function AirportLounges({ iata }: { iata: string }) {
  const lounges = useLounges(iata);
  return (
    <section aria-labelledby="lounges-heading" className="space-y-3">
      <h2 id="lounges-heading" className="flex items-center gap-2 text-xl font-semibold">
        <Sofa aria-hidden="true" className="size-5 text-primary" /> Lounges
      </h2>
      {lounges.isError && !lounges.data ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load lounges right now.</p>
      ) : !lounges.data ? (
        <LoadingLounges waking={lounges.waking} />
      ) : lounges.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          <p>
            No lounges recorded for {iata} yet. We only list lounges checked against the
            operator&apos;s own page.
          </p>
          <div className="mt-3">
            <ContributeButton label="Add a lounge" />
          </div>
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {lounges.data.items.map((l) => (
              <li key={l.slug}>
                <LoungeCard lounge={l} showAirport={false} />
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link
              href={`/cards?airport=${iata}`}
              className="underline underline-offset-2 hover:text-primary"
            >
              Check which of your cards get you in
            </Link>
            <Link
              href={`/lounges?airport=${iata}`}
              className="underline underline-offset-2 hover:text-primary"
            >
              All lounges at {iata}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
