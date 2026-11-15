"use client";

import { Info, PlaneTakeoff, SlidersHorizontal } from "lucide-react";
import { useId, useState, type Ref } from "react";

import { DemoBadge } from "@/components/data/demo-badge";
import { EmptyState } from "@/components/data/empty-state";
import { RelativeTime } from "@/components/data/relative-time";
import { airportLabel } from "@/components/live/airport-search";
import { FilterChip } from "@/components/search/filter-chip";
import { Button } from "@/components/ui/button";
import type { AirlineOption, FareSearchResponse, FareSort } from "@/lib/api/client";
import type { MapAirport } from "@/lib/airports";
import {
  cabinLabel,
  formatFareDate,
  passengerCount,
  passengersLabel,
  SORTS,
  type FareFilters,
} from "@/lib/fares";
import { cn } from "@/lib/utils";

import { FareFilterPanel } from "./fare-filters";
import { OfferCard } from "./offer-card";

type Props = {
  data: FareSearchResponse;
  airports: readonly MapAirport[] | undefined;
  /** The form no longer matches these results. */
  stale: boolean;
  /** A request with new filters or sort is on its way. */
  updating: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  sort: FareSort;
  onSort: (sort: FareSort) => void;
  filters: FareFilters;
  onFilters: (next: FareFilters) => void;
  airlines: readonly AirlineOption[];
  priceText: string;
  onPriceText: (text: string) => void;
  priceError: string | null;
  filtersActive: number;
  onClearFilters: () => void;
  onSearchAgain: () => void;
};

export function FareResults({
  data,
  airports,
  stale,
  updating,
  headingRef,
  sort,
  onSort,
  filters,
  onFilters,
  airlines,
  priceText,
  onPriceText,
  priceError,
  filtersActive,
  onClearFilters,
  onSearchAgain,
}: Props) {
  const id = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = `${id}-filters`;
  const travellers = passengerCount(data.passengers);
  const dates = data.return_date
    ? `${formatFareDate(data.departure_date)} – ${formatFareDate(data.return_date)}`
    : formatFareDate(data.departure_date);
  const providerMissing = data.providers.some((p) => p.status !== "ok");
  const budgetNote =
    data.budget && (data.budget.message || data.budget.near_limit)
      ? (data.budget.message ??
        "Fare searches are close to today's limit. If a search is refused, try again tomorrow.")
      : null;

  return (
    <section aria-labelledby="fare-results-heading" className="space-y-4">
      <div className="space-y-1">
        <h2
          id="fare-results-heading"
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-20 text-xl font-semibold outline-none"
        >
          {airportLabel(data.origin, airports)} <span aria-hidden="true">→</span>
          <span className="sr-only">to</span> {airportLabel(data.destination, airports)} · {dates} ·{" "}
          {passengersLabel(data.passengers)} · {cabinLabel(data.cabin)}
        </h2>
        <p className="flex flex-wrap gap-x-1 text-sm text-muted-foreground">
          <span aria-live="polite" aria-atomic="true">
            {data.offers.length} of {data.total_offers} fare{data.total_offers === 1 ? "" : "s"}
            {updating ? <span> · updating…</span> : null}
          </span>
          {data.fetched_at ? (
            <span>
              · Prices fetched <RelativeTime iso={data.fetched_at} />
            </span>
          ) : null}
        </p>
      </div>

      {data.is_demo ? <DemoBadge note="not real fares" className="text-sm" /> : null}

      {stale ? (
        <p
          role="status"
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          These results are for your earlier search. Press Search to update them.
        </p>
      ) : null}

      {budgetNote ? (
        <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{budgetNote}</span>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        <aside aria-label="Filters" className="min-w-0">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-start px-3 lg:hidden"
            aria-expanded={filtersOpen}
            aria-controls={panelId}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
            {filtersActive ? (
              <span className="text-muted-foreground">({filtersActive} on)</span>
            ) : null}
          </Button>
          <div
            id={panelId}
            className={cn(
              "mt-3 rounded-xl border bg-card p-4 lg:mt-0 lg:block",
              !filtersOpen && "hidden",
            )}
          >
            <FareFilterPanel
              filters={filters}
              onChange={onFilters}
              airlines={airlines}
              priceText={priceText}
              onPriceText={onPriceText}
              priceError={priceError}
              onClear={filtersActive ? onClearFilters : null}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div role="group" aria-label="Sort by" className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="text-sm text-muted-foreground">
              Sort:
            </span>
            {SORTS.map((s) => (
              <FilterChip key={s.value} pressed={sort === s.value} onClick={() => onSort(s.value)}>
                {s.label}
              </FilterChip>
            ))}
          </div>

          <div
            aria-busy={updating}
            className={cn("transition-opacity", (updating || stale) && "opacity-60")}
          >
            {data.offers.length ? (
              <ul className="space-y-3">
                {data.offers.map((offer) => (
                  <li key={offer.id}>
                    <OfferCard
                      offer={offer}
                      passengers={travellers}
                      onSearchAgain={onSearchAgain}
                    />
                  </li>
                ))}
              </ul>
            ) : data.total_offers > 0 ? (
              <EmptyState
                icon={SlidersHorizontal}
                title="No flights match these filters"
                description={`${data.total_offers} fare${data.total_offers === 1 ? " was" : "s were"} found, but none match. Loosen or clear the filters.`}
              >
                <Button type="button" variant="outline" onClick={onClearFilters}>
                  Clear filters
                </Button>
              </EmptyState>
            ) : (
              <EmptyState
                icon={PlaneTakeoff}
                title="No fares found for this route and date"
                description="The fare source has nothing on sale for this search. Try another date, or a nearby airport."
              />
            )}
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            {providerMissing && data.total_offers > 0 ? (
              <p>One fare source didn&apos;t answer; results may be incomplete.</p>
            ) : providerMissing ? (
              <p>One fare source didn&apos;t answer, so there may be fares we couldn&apos;t see.</p>
            ) : null}
            {data.excluded_abroad > 0 ? (
              <p>
                {data.excluded_abroad} itinerar{data.excluded_abroad === 1 ? "y" : "ies"} connecting
                outside India {data.excluded_abroad === 1 ? "isn't" : "aren't"} shown.
              </p>
            ) : null}
            {data.notice ? <p>{data.notice}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
