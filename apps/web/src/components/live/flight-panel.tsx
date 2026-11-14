"use client";

import { ArrowRight, RadioTower, Star, X } from "lucide-react";

import { DemoBadge } from "@/components/data/demo-badge";
import { Field, NotAvailable } from "@/components/data/field";
import { StaleIndicator } from "@/components/data/stale-indicator";
import { Button } from "@/components/ui/button";
import type { AircraftDetail, AircraftFeature } from "@/lib/api/client";
import { useNow } from "@/hooks/use-now";
import { formatIst, formatIstWithDay } from "@/lib/freshness";
import { cn } from "@/lib/utils";

import {
  cleanIdent,
  displayName,
  formatAltitude,
  formatHeading,
  formatMinutes,
  formatSpeed,
  formatVerticalRate,
  typeName,
} from "./format";

type Props = {
  feature: AircraftFeature;
  detail: AircraftDetail | null | undefined;
  loading: boolean;
  /** The last details request failed (the API may be waking up). */
  error: boolean;
  watched: boolean;
  onToggleWatch: () => void;
  onClose: () => void;
};

/** Selected-flight card. Every value is either from the data or explicitly "Not available". */
export function FlightPanel({
  feature,
  detail,
  loading,
  error,
  watched,
  onToggleWatch,
  onClose,
}: Props) {
  const now = useNow();
  const p = feature.properties;
  const callsign = cleanIdent(p.callsign);
  const route = detail?.reported_route ?? null;
  const progress = detail?.progress ?? null;
  const name = displayName({ ...p, flight_number: route?.flight_number ?? p.flight_number });
  const [lon, lat] = feature.geometry.coordinates;

  return (
    <section
      aria-label={`Flight ${name}`}
      className="flex max-h-full flex-col overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur"
    >
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-mono text-lg font-semibold">{name}</h2>
            {p.is_demo ? <DemoBadge /> : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {route?.airline_name ?? (callsign ? `Callsign ${callsign}` : "No callsign broadcast")}
          </p>
          <StaleIndicator observedAt={p.position_time} />
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleWatch}
            aria-pressed={watched}
            aria-label={watched ? "Stop watching this flight" : "Watch this flight"}
          >
            <Star aria-hidden="true" className={cn(watched && "fill-warning text-warning")} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close flight details">
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="space-y-4 overflow-y-auto p-4">
        {/* Route */}
        {route ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Airport
                code={route.origin.iata ?? route.origin.icao}
                city={route.origin.city ?? route.origin.name}
              />
              <ArrowRight aria-label="to" className="size-4 shrink-0 text-muted-foreground" />
              <Airport
                code={route.destination.iata ?? route.destination.icao}
                city={route.destination.city ?? route.destination.name}
                align="right"
              />
            </div>
            {progress ? (
              <div
                role="progressbar"
                aria-label="Route progress"
                aria-valuenow={Math.round(progress.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Reported route from{" "}
              <a
                href={route.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
              >
                {route.source}
              </a>
              . Not an airline schedule.
            </p>
          </div>
        ) : (
          <RouteNote loading={loading} error={error} detail={detail} />
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Aircraft type" value={typeName(p.type_code)} />
          <Field label="Registration" value={p.registration} mono />
          <Field label="Altitude" value={formatAltitude(p.alt_baro_ft, p.on_ground)} mono />
          <Field label="Ground speed" value={formatSpeed(p.gs_kt)} mono />
          <Field label="Heading" value={formatHeading(p.track_deg)} mono />
          <Field label="Vertical" value={formatVerticalRate(p.vrate_fpm)} />
          <Field label="Status" value={p.on_ground ? "On ground" : "Airborne"} />
          <Field label="Position" value={`${lat.toFixed(3)}, ${lon.toFixed(3)}`} mono />
          <Field
            label="Estimated arrival"
            value={
              progress?.estimated_arrival
                ? [
                    now === null
                      ? formatIst(progress.estimated_arrival)
                      : formatIstWithDay(progress.estimated_arrival, new Date(now)),
                    formatMinutes(progress.minutes_remaining),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : null
            }
            missingReason={
              route ? "Needs a moving aircraft with a known destination" : "No reported destination"
            }
          />
          <Field
            label="Distance left"
            value={
              progress ? `${Math.round(progress.remaining_km).toLocaleString("en-IN")} km` : null
            }
            mono
          />
          <Field label="ICAO 24-bit address" value={p.icao24.toUpperCase()} mono />
          <Field label="Last position" value={formatIst(p.position_time)} />
        </dl>
        <p className="text-xs text-muted-foreground">
          Schedules aren&apos;t available from open data.
          {progress?.estimated_arrival
            ? " Estimated arrival is calculated from the live position and ground speed. It isn't an airline estimate."
            : null}
        </p>
      </div>
    </section>
  );
}

/** Why there's no route. Says nothing when the API no longer tracks the aircraft (null). */
function RouteNote({
  loading,
  error,
  detail,
}: {
  loading: boolean;
  error: boolean;
  detail: AircraftDetail | null | undefined;
}) {
  if (detail === null) return null;
  const text = loading
    ? "Looking up the reported route…"
    : detail
      ? (detail.route_note ?? "No reported route for this flight.")
      : error
        ? "Couldn't look up the reported route. Retrying…"
        : null;
  if (!text) return null;
  return (
    <p role="status" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function Airport({
  code,
  city,
  align,
}: {
  code: string | null | undefined;
  city: string | null | undefined;
  align?: "right";
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      {code ? (
        <p className="font-mono text-2xl font-semibold">{code}</p>
      ) : (
        <p className="py-1.5 text-sm">
          <NotAvailable reason="The route source gives no airport code" />
        </p>
      )}
      <p className="truncate text-xs">
        {city ? (
          <span className="text-muted-foreground">{city}</span>
        ) : (
          <NotAvailable kind="notStated" />
        )}
      </p>
    </div>
  );
}

/** Shown when the selected aircraft drops out of the feed (landed, or out of receiver range). */
export function LostFlightPanel({ name, onClose }: { name: string | null; onClose: () => void }) {
  return (
    <section
      aria-label={name ? `Flight ${name}` : "Selected flight"}
      className="flex items-start gap-3 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <RadioTower aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div role="status" className="min-w-0 flex-1 space-y-1">
        <h2 className="font-semibold">
          {name ? <span className="font-mono">{name}: </span> : null}
          This aircraft is no longer in coverage
        </h2>
        <p className="text-sm text-muted-foreground">
          It may have landed, switched off its transponder or flown out of range of the open
          receiver network. It will reappear here if it&apos;s picked up again.
        </p>
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close flight details">
        <X aria-hidden="true" />
      </Button>
    </section>
  );
}
