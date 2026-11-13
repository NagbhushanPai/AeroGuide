"use client";

import { ArrowRight, Star, X } from "lucide-react";

import { DemoBadge } from "@/components/data/demo-badge";
import { Field } from "@/components/data/field";
import { StaleIndicator } from "@/components/data/stale-indicator";
import { Button } from "@/components/ui/button";
import type { AircraftDetail, AircraftFeature } from "@/lib/api/client";
import { formatIst } from "@/lib/freshness";
import { cn } from "@/lib/utils";

import {
  displayName,
  formatAltitude,
  formatHeading,
  formatMinutes,
  formatSpeed,
  formatVerticalRate,
  typeName,
} from "./format";

const NO_SCHEDULE = "Not available from open data sources";

type Props = {
  feature: AircraftFeature;
  detail: AircraftDetail | null | undefined;
  loading: boolean;
  watched: boolean;
  onToggleWatch: () => void;
  onClose: () => void;
};

/** Selected-flight card. Every value is either from the data or explicitly "Not available". */
export function FlightPanel({ feature, detail, loading, watched, onToggleWatch, onClose }: Props) {
  const p = feature.properties;
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
            {route?.airline_name ??
              (p.callsign ? `Callsign ${p.callsign}` : "No callsign broadcast")}
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
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {loading
              ? "Looking up the reported route…"
              : (detail?.route_note ?? "No reported route for this flight.")}
          </p>
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
                ? `${formatIst(progress.estimated_arrival).split(", ")[1]} · ${formatMinutes(progress.minutes_remaining)}`
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
          <Field label="Scheduled departure" value={null} missingReason={NO_SCHEDULE} />
          <Field label="Scheduled arrival" value={null} missingReason={NO_SCHEDULE} />
          <Field label="ICAO 24-bit address" value={p.icao24.toUpperCase()} mono />
          <Field label="Last position" value={formatIst(p.position_time)} />
        </dl>
        {progress?.estimated_arrival ? (
          <p className="text-xs text-muted-foreground">
            Estimated arrival is calculated from the live position and ground speed. It isn&apos;t
            an airline estimate.
          </p>
        ) : null}
      </div>
    </section>
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
      <p className="font-mono text-2xl font-semibold">{code ?? "—"}</p>
      <p className="truncate text-xs text-muted-foreground">{city ?? "Unknown"}</p>
    </div>
  );
}
