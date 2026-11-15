"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeftRight, Search, TicketsPlane } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ErrorState } from "@/components/data/error-state";
import { WakingMessage } from "@/components/data/waking-message";
import { AirportCombobox, airportLabel, useMapAirports } from "@/components/live/airport-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWaking } from "@/hooks/use-waking";
import { searchMapAirports } from "@/lib/airports";
import {
  ApiError,
  searchFares,
  type AirlineOption,
  type FareSearchRequest,
  type FareSearchResponse,
  type FareSort,
} from "@/lib/api/client";
import { parseWholeNumber } from "@/lib/checker";
import {
  baseSearch,
  CABINS,
  fareErrorMessage,
  fareParamUpdates,
  fareRequest,
  formatFareDate,
  formBlocker,
  nearbyExtras,
  NO_FILTERS,
  passengersError,
  readFareParams,
  type BaseSearch,
  type FareFilters,
  type FareForm,
} from "@/lib/fares";
import { todayIst } from "@/lib/freshness";
import { replaceParams } from "@/lib/url-state";

import { FareResults } from "./fare-results";
import { PassengersPicker } from "./passengers-picker";

/** The last answer, with the base search it answers (to spot later form changes). */
type Answer = { data: FareSearchResponse; base: string };

const inputClass =
  "h-10 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive sm:text-sm";

/** Filter changes wait this long before asking again, so typing a price sends one request. */
const FILTER_DEBOUNCE_MS = 300;

/**
 * Fare search for domestic routes. The form lives in the URL so refresh, back and shared links
 * restore it, but a search only runs when the person presses Search: each new search costs an
 * upstream request. Filters and sort are applied by the API to the results it already has.
 */
export function FareSearch() {
  const params = useSearchParams();
  const airports = useMapAirports();
  const formId = useId();

  const [today] = useState(() => todayIst());
  const [form, setForm] = useState<FareForm>(() => readFareParams(params));
  const [nearby, setNearby] = useState(false);
  const [filters, setFilters] = useState<FareFilters>(NO_FILTERS);
  const [priceText, setPriceText] = useState("");
  const [submitted, setSubmitted] = useState<BaseSearch | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** Airline names seen for the current search, so a chosen airline keeps its name. */
  const [airlineNames, setAirlineNames] = useState<Record<string, string>>({});

  const resultsRef = useRef<HTMLHeadingElement>(null);
  const focusResults = useRef(false);
  const lastRequest = useRef<FareSearchRequest | null>(null);

  const search = useMutation({
    mutationFn: (body: FareSearchRequest) => searchFares(body),
    onSuccess: (data, body) => {
      if (body !== lastRequest.current) return; // an older request answered late
      setAirlineNames((names) => ({
        ...names,
        ...Object.fromEntries(data.airlines.map((a) => [a.code, a.name])),
      }));
      setAnswer({ data, base: JSON.stringify(baseOf(body)) });
    },
    // Never retried on its own: every search can cost an upstream request. Try again is manual.
    retry: false,
  });
  const waking = useWaking(search.isPending);

  // ---- validation ----
  const blocker = formBlocker(form, today);
  const paxError = passengersError(form.passengers);
  const price = parseWholeNumber(priceText, "8,000");
  const fullFilters: FareFilters = { ...filters, maxPrice: price.value };
  const extras = nearbyExtras(form.origin, form.destination);
  const currentBase = JSON.stringify(baseSearch(form, nearby));
  const stale = !!answer && answer.base !== currentBase;

  function run(body: FareSearchRequest) {
    lastRequest.current = body;
    search.mutate(body);
  }

  // ---- filters and sort: ask again (debounced) with the same base search ----
  const filterRequest = submitted ? fareRequest(submitted, fullFilters, form.sort) : null;
  const filterKey = filterRequest ? JSON.stringify(filterRequest) : null;
  useEffect(() => {
    if (!filterKey || price.error) return;
    if (filterKey === JSON.stringify(lastRequest.current)) return;
    const t = setTimeout(() => run(JSON.parse(filterKey) as FareSearchRequest), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // run is stable enough: it only reads refs and the mutation's stable mutate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, price.error]);

  // ---- move focus to the results when a new search answers ----
  useEffect(() => {
    if (!answer || !focusResults.current) return;
    focusResults.current = false;
    const el = resultsRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [answer]);

  function update(patch: Partial<FareForm>) {
    const next = { ...form, ...patch };
    setForm(next);
    replaceParams(fareParamUpdates(next));
  }

  function onAirportText(field: "origin" | "destination", text: string) {
    const t = text.trim().toUpperCase();
    const list = airports.data ?? [];
    if (list.some((a) => a.iata === t)) return update({ [field]: t });
    // A code we don't list: allow it, and the API explains.
    if (/^[A-Z]{3}$/.test(t) && searchMapAirports(list, t).length === 0)
      return update({ [field]: t });
    if (form[field]) update({ [field]: "" });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (blocker || search.isPending) return;
    const base = baseSearch(form, nearby);
    // A new route has different airlines: keep the other filters, drop the airline choice.
    setFilters({ ...filters, airlines: [] });
    setAirlineNames({});
    setSubmitted(base);
    focusResults.current = true;
    run(fareRequest(base, { ...fullFilters, airlines: [] }, form.sort));
  }

  function searchAgain() {
    if (!lastRequest.current) return;
    focusResults.current = true;
    run(lastRequest.current);
  }

  function clearFilters() {
    setFilters(NO_FILTERS);
    setPriceText("");
  }

  const airlineOptions = useMemo<AirlineOption[]>(() => {
    const list = answer?.data.airlines ?? [];
    const missing = filters.airlines
      .filter((code) => !list.some((a) => a.code === code))
      .map((code) => ({ code, name: airlineNames[code] ?? code, offers: 0 }));
    return [...list, ...missing];
  }, [answer, filters.airlines, airlineNames]);

  const filtersActive =
    (filters.maxStops !== null ? 1 : 0) +
    (filters.airlines.length ? 1 : 0) +
    (filters.time !== null ? 1 : 0) +
    (priceText.trim() ? 1 : 0);

  const blockerId = `${formId}-blocker`;
  const error = search.isError ? search.error : null;
  const errorStatus = error instanceof ApiError ? error.status : null;
  const canRetry = errorStatus !== 422 && errorStatus !== 429;

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        noValidate
        className="space-y-5 rounded-xl border bg-card p-4 sm:p-5"
        aria-labelledby={`${formId}-title`}
      >
        <h2 id={`${formId}-title`} className="text-lg font-semibold">
          Search fares
        </h2>

        <div className="flex flex-wrap items-end gap-4">
          <fieldset className="text-sm">
            <legend className="mb-1 font-medium">Trip</legend>
            <div className="flex h-10 items-center gap-4">
              {(
                [
                  ["oneway", "One way"],
                  ["round", "Round trip"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex min-h-10 items-center gap-2">
                  <input
                    type="radio"
                    name={`${formId}-trip`}
                    checked={form.trip === value}
                    onChange={() => update({ trip: value })}
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="w-full min-[480px]:w-48">
            <PassengersPicker
              value={form.passengers}
              onChange={(passengers) => update({ passengers })}
              error={paxError}
            />
          </div>
          <label className="block w-full text-sm font-medium min-[480px]:w-44">
            Cabin
            <select
              value={form.cabin}
              onChange={(e) => update({ cabin: e.target.value as FareForm["cabin"] })}
              className={`${inputClass} mt-1`}
            >
              {CABINS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_10rem_10rem]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 lg:contents">
            <AirportCombobox
              label="From"
              placeholder="City, airport or code"
              display={form.origin ? airportLabel(form.origin, airports.data) : ""}
              onSelect={(a) => update({ origin: a.iata })}
              onTextChange={(t) => onAirportText("origin", t)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-10 self-end"
              aria-label="Swap From and To"
              onClick={() => update({ origin: form.destination, destination: form.origin })}
              disabled={!form.origin && !form.destination}
            >
              <ArrowLeftRight aria-hidden="true" className="rotate-90 lg:rotate-0" />
            </Button>
          </div>
          <AirportCombobox
            label="To"
            placeholder="City, airport or code"
            display={form.destination ? airportLabel(form.destination, airports.data) : ""}
            onSelect={(a) => update({ destination: a.iata })}
            onTextChange={(t) => onAirportText("destination", t)}
          />
          <label className="block text-sm font-medium">
            Departure
            <input
              type="date"
              value={form.depart}
              min={today}
              onChange={(e) => update({ depart: e.target.value })}
              className={`${inputClass} mt-1`}
            />
          </label>
          {form.trip === "round" ? (
            <label className="block text-sm font-medium">
              Return
              <input
                type="date"
                value={form.ret}
                min={form.depart || today}
                onChange={(e) => update({ ret: e.target.value })}
                className={`${inputClass} mt-1`}
              />
            </label>
          ) : null}
        </div>

        {extras.length ? (
          <div className="text-sm">
            <label className="flex min-h-10 items-center gap-2">
              <input
                type="checkbox"
                checked={nearby}
                onChange={(e) => setNearby(e.target.checked)}
                aria-describedby={`${formId}-nearby-help`}
                className="size-4 accent-primary"
              />
              Also search the city&apos;s other airport
            </label>
            <p id={`${formId}-nearby-help`} className="ml-6 text-xs text-muted-foreground">
              Adds {extras.join(" and ")}:{" "}
              {extras.length === 1
                ? "searches one more airport pair"
                : "searches more airport pairs"}
              , so it takes a little longer.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            size="lg"
            className="h-11 min-w-28 px-5"
            disabled={!!blocker || search.isPending}
            aria-describedby={blocker ? blockerId : undefined}
          >
            <Search aria-hidden="true" />
            {search.isPending ? "Searching…" : "Search"}
          </Button>
          {blocker ? (
            <p id={blockerId} className="text-sm text-muted-foreground">
              {blocker}
            </p>
          ) : null}
        </div>
        {search.isPending && waking ? <WakingMessage /> : null}
      </form>

      {error ? (
        <ErrorState
          title={errorStatus === 429 ? "Fare search is paused for now" : "Couldn't search fares"}
          description={fareErrorMessage(error)}
          onRetry={canRetry ? searchAgain : undefined}
        />
      ) : null}

      {answer ? (
        <FareResults
          data={answer.data}
          airports={airports.data}
          stale={stale}
          updating={search.isPending}
          headingRef={resultsRef}
          sort={form.sort}
          onSort={(sort: FareSort) => update({ sort })}
          filters={filters}
          onFilters={setFilters}
          airlines={airlineOptions}
          priceText={priceText}
          onPriceText={setPriceText}
          priceError={price.error}
          filtersActive={filtersActive}
          onClearFilters={clearFilters}
          onSearchAgain={searchAgain}
        />
      ) : search.isPending ? (
        <ResultsSkeleton />
      ) : !error ? (
        <Intro
          ready={
            !blocker
              ? `${airportLabel(form.origin, airports.data)} to ${airportLabel(form.destination, airports.data)} on ${formatFareDate(form.depart)}`
              : null
          }
        />
      ) : null}
    </div>
  );
}

/** The route, dates, passengers and cabin of a request: what a new search is. */
function baseOf(body: FareSearchRequest): BaseSearch {
  return {
    origin: body.origin,
    destination: body.destination,
    departure_date: body.departure_date,
    ...(body.return_date ? { return_date: body.return_date } : {}),
    passengers: body.passengers,
    cabin: body.cabin,
    nearby_airports: body.nearby_airports,
  };
}

function Intro({ ready }: { ready: string | null }) {
  return (
    <section
      aria-labelledby="fares-intro"
      className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-12 text-center"
    >
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-muted text-primary">
        <TicketsPlane aria-hidden="true" className="size-6" />
      </span>
      <h2 id="fares-intro" className="text-lg font-semibold">
        {ready ? "Ready to search" : "Compare fares on flights within India"}
      </h2>
      <div className="mt-2 max-w-md space-y-2 text-sm text-muted-foreground">
        {ready ? (
          <p>
            Press Search to see fares for {ready}. Searches don&apos;t run on their own, because
            each one uses part of a daily allowance.
          </p>
        ) : null}
        <p>
          We ask Ignav for fares on domestic routes and show them side by side. Prices change often,
          and the seller confirms the final price when you book.
        </p>
      </div>
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <p role="status" className="sr-only">
        Searching fares…
      </p>
      <Skeleton className="h-7 w-full max-w-lg" />
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}
