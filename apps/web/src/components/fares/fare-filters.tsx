"use client";

import { useId } from "react";

import type { AirlineOption } from "@/lib/api/client";
import { TIME_WINDOWS, type FareFilters, type TimeWindow } from "@/lib/fares";

const STOPS: readonly { value: FareFilters["maxStops"]; label: string }[] = [
  { value: null, label: "Any" },
  { value: 0, label: "Non-stop" },
  { value: 1, label: "Up to 1 stop" },
];

const radioRow = "flex min-h-9 items-center gap-2 text-sm";
const control = "size-4 shrink-0 accent-primary";

/**
 * Filters for the fare results. They're applied by the API to the results it already has, so
 * changing them never costs another fare search.
 */
export function FareFilterPanel({
  filters,
  onChange,
  airlines,
  priceText,
  onPriceText,
  priceError,
  onClear,
}: {
  filters: FareFilters;
  onChange: (next: FareFilters) => void;
  airlines: readonly AirlineOption[];
  priceText: string;
  onPriceText: (text: string) => void;
  priceError: string | null;
  onClear: (() => void) | null;
}) {
  const id = useId();
  const set = (patch: Partial<FareFilters>) => onChange({ ...filters, ...patch });

  function toggleAirline(code: string) {
    set({
      airlines: filters.airlines.includes(code)
        ? filters.airlines.filter((c) => c !== code)
        : [...filters.airlines, code],
    });
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Stops</legend>
        {STOPS.map((s) => (
          <label key={s.label} className={radioRow}>
            <input
              type="radio"
              name={`${id}-stops`}
              checked={filters.maxStops === s.value}
              onChange={() => set({ maxStops: s.value })}
              className={control}
            />
            {s.label}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Departure time</legend>
        <label className={radioRow}>
          <input
            type="radio"
            name={`${id}-time`}
            checked={filters.time === null}
            onChange={() => set({ time: null })}
            className={control}
          />
          Any time
        </label>
        {TIME_WINDOWS.map((w) => (
          <label key={w.value} className={radioRow}>
            <input
              type="radio"
              name={`${id}-time`}
              checked={filters.time === w.value}
              onChange={() => set({ time: w.value as TimeWindow })}
              className={control}
            />
            <span>
              {w.label} <span className="text-muted-foreground">{w.range}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {airlines.length ? (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Airlines</legend>
          {airlines.map((a) => (
            <label key={a.code} className={radioRow}>
              <input
                type="checkbox"
                checked={filters.airlines.includes(a.code)}
                onChange={() => toggleAirline(a.code)}
                className={control}
              />
              <span className="min-w-0 flex-1">{a.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {a.offers}
                <span className="sr-only"> fares</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div>
        <label htmlFor={`${id}-price`} className="block text-sm font-semibold">
          Maximum price (₹)
        </label>
        <input
          id={`${id}-price`}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Any"
          value={priceText}
          onChange={(e) => onPriceText(e.target.value)}
          aria-invalid={priceError ? true : undefined}
          aria-describedby={`${id}-price-help${priceError ? ` ${id}-price-error` : ""}`}
          className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive sm:text-sm"
        />
        <span id={`${id}-price-help`} className="mt-1 block text-xs text-muted-foreground">
          Total for all passengers.
        </span>
        {priceError ? (
          <span id={`${id}-price-error`} className="mt-1 block text-xs text-destructive">
            {priceError}
          </span>
        ) : null}
      </div>

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="min-h-9 rounded text-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
