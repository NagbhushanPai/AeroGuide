"use client";

import {
  ArrowLeft,
  DoorOpen,
  ExternalLink,
  Info,
  MapPin,
  Plane,
  SearchX,
  Sofa,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { Field } from "@/components/data/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AirportDetail, SourceRef, TerminalOut } from "@/lib/api/client";

import { AirlinesSeen } from "./airlines-seen";
import { MappedTerminals } from "./mapped-terminals";
import { ProvenanceLine } from "./provenance-line";
import { useAirport } from "./use-airports";

const ROLE_LABEL = {
  domestic: "Domestic",
  international: "International",
  mixed: "Domestic and international",
};
const OPERATION_LABEL = {
  domestic: "Domestic",
  international: "International",
  both: "Domestic and international",
};

export function AirportGuide({ code }: { code: string }) {
  const airport = useAirport(code);

  if (airport.isError && airport.data === undefined) {
    return (
      <ErrorState
        title="Couldn't load this airport"
        description="The airport service didn't respond. It may still be starting up."
        onRetry={() => void airport.refetch()}
      />
    );
  }
  if (airport.data === undefined) {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {airport.waking
            ? "Waking the data server. On the free tier this can take up to a minute…"
            : "Loading airport…"}
        </p>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (airport.data === null) {
    return (
      <EmptyState
        icon={SearchX}
        title={`No airport with code ${code}`}
        description="AeroGuide lists Indian airports with scheduled passenger service. Check the code, or search the directory."
      >
        <Button asChild variant="outline">
          <Link href="/airports">Browse airports</Link>
        </Button>
      </EmptyState>
    );
  }
  return <Guide airport={airport.data} />;
}

function Guide({ airport: a }: { airport: AirportDetail }) {
  const place = [a.city, a.state].filter(Boolean).join(", ");
  return (
    <article className="space-y-10">
      <header className="space-y-4">
        <Link
          href="/airports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> All airports
        </Link>
        <div className="space-y-2">
          <p className="font-mono text-sm tracking-wider text-primary">
            {a.iata}
            {a.icao ? <span className="text-muted-foreground"> · {a.icao}</span> : null}
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{a.name}</h1>
          <p className="text-muted-foreground">
            {place || "City not recorded"} · {a.region} India
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/?airport=${a.iata}`}>
              <Plane aria-hidden="true" /> Show on the live map
            </Link>
          </Button>
          {a.official_source ? <OfficialLink source={a.official_source} /> : null}
        </div>
      </header>

      <section aria-labelledby="details-heading" className="rounded-xl border bg-card p-5">
        <h2 id="details-heading" className="mb-4 flex items-center gap-2 font-semibold">
          <MapPin aria-hidden="true" className="size-4 text-primary" /> Airport details
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="IATA code" value={a.iata} mono />
          <Field label="ICAO code" value={a.icao} mono />
          <Field label="City" value={a.city} />
          <Field label="State or territory" value={a.state} />
          <Field label="Region" value={a.region} />
          <Field
            label="Elevation"
            value={a.elevation_ft === null ? null : `${a.elevation_ft.toLocaleString("en-IN")} ft`}
            mono
          />
          <Field label="Coordinates" value={`${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}`} mono />
          <Field label="Time zone" value={`${a.timezone} (IST, UTC+05:30)`} />
        </dl>
        <ProvenanceLine provenance={a.provenance} className="mt-5 border-t pt-4" />
      </section>

      <section aria-labelledby="terminals-heading" className="space-y-4">
        <h2 id="terminals-heading" className="flex items-center gap-2 text-xl font-semibold">
          <DoorOpen aria-hidden="true" className="size-5 text-primary" /> Terminals and airlines
        </h2>
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          {a.terminal_note}
        </p>
        {a.terminals.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="Terminal information not yet verified"
            description={
              <>
                We haven&apos;t checked the terminals at {a.iata} against an official source yet, so
                none are listed.{" "}
                {a.official_source
                  ? "The airport's official website has the current terminal guide."
                  : "Check with your airline for the terminal."}
              </>
            }
          >
            {a.official_source ? <OfficialLink source={a.official_source} /> : null}
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {a.terminals.map((t) => (
              <li key={t.code}>
                <TerminalCard terminal={t} />
              </li>
            ))}
          </ul>
        )}
        {a.mapped_terminals ? <MappedTerminals data={a.mapped_terminals} /> : null}
      </section>

      <AirlinesSeen code={a.iata} />

      <section aria-labelledby="lounges-heading" className="space-y-2">
        <h2 id="lounges-heading" className="flex items-center gap-2 text-xl font-semibold">
          <Sofa aria-hidden="true" className="size-5 text-primary" /> Lounges
        </h2>
        <p className="text-sm text-muted-foreground">
          Lounge guides are planned for a later stage.{" "}
          <Link href="/lounges" className="underline underline-offset-2 hover:text-foreground">
            About lounges
          </Link>
        </p>
      </section>
    </article>
  );
}

function OfficialLink({ source }: { source: SourceRef }) {
  return (
    <Button asChild variant="outline">
      <a href={source.url} target="_blank" rel="noopener noreferrer">
        Official website <ExternalLink aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Button>
  );
}

function TerminalCard({ terminal: t }: { terminal: TerminalOut }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-semibold">
          <span className="font-mono text-primary">{t.code}</span> {t.name}
        </h3>
        <Badge variant="outline">{ROLE_LABEL[t.role]}</Badge>
      </div>
      <ProvenanceLine provenance={t.provenance} className="mt-2" />
      {t.airlines.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No verified airline assignments for this terminal yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y border-t">
          {t.airlines.map((ta) => (
            <li key={`${ta.airline.icao}-${ta.operation}-${ta.valid_from}`} className="py-3">
              <p className="text-sm font-medium">
                {ta.airline.name}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {ta.airline.iata ?? ta.airline.icao}
                </span>
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {OPERATION_LABEL[ta.operation]}
                </span>
              </p>
              {ta.scope_note ? (
                <p className="text-sm text-muted-foreground">{ta.scope_note}</p>
              ) : null}
              <ProvenanceLine provenance={ta.provenance} className="mt-1" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
