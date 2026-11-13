"use client";

import { Eye, Plane } from "lucide-react";

import { RelativeTime } from "@/components/data/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIstDate } from "@/lib/freshness";

import { useAirlinesSeen } from "./use-airports";

const DAYS = 7;

/** Airlines observed at the airport in community ADS-B data. An observation, never a schedule. */
export function AirlinesSeen({ code }: { code: string }) {
  const seen = useAirlinesSeen(code, DAYS);

  return (
    <section aria-labelledby="airlines-seen-heading" className="space-y-3">
      <h2 id="airlines-seen-heading" className="flex items-center gap-2 text-xl font-semibold">
        <Eye aria-hidden="true" className="size-5 text-primary" /> Airlines seen here
      </h2>

      {seen.isError && seen.data === undefined ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load sightings right now.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => void seen.refetch()}
          >
            Try again
          </button>
        </p>
      ) : seen.data === undefined ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : seen.data === null ? null : (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            {formatIstDate(seen.data.since)} – {formatIstDate(seen.data.until)} · data on{" "}
            {seen.data.days_with_data} of {seen.data.days} days
          </p>
          {seen.data.airlines.length === 0 ? (
            <p className="mt-3 text-sm">
              No airline aircraft have been seen here in the last {DAYS} days. That usually means
              the live service wasn&apos;t running or receivers don&apos;t cover this airport, not
              that there are no flights.
            </p>
          ) : (
            <ul className="mt-3 divide-y">
              {seen.data.airlines.map((a) => (
                <li key={a.icao} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="flex items-baseline gap-2">
                    <Plane
                      aria-hidden="true"
                      className="size-3.5 self-center text-muted-foreground"
                    />
                    <span className="font-mono font-semibold text-primary">{a.icao}</span>
                    <span>
                      {a.name ?? <span className="text-muted-foreground">Name not reported</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {a.aircraft} aircraft · {a.days_seen} day{a.days_seen === 1 ? "" : "s"} · last{" "}
                    <RelativeTime iso={a.last_seen} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{seen.data.method}</p>
          <p className="mt-1 text-xs text-muted-foreground">Source: {seen.data.source}</p>
        </div>
      )}
    </section>
  );
}
