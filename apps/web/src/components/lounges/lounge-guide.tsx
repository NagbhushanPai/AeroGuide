"use client";

import { ArrowLeft, Clock, MapPin, SearchX, Sparkles, Ticket } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { Field } from "@/components/data/field";
import { ProvenanceLine } from "@/components/airports/provenance-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LoungeDetail } from "@/lib/api/client";
import { formatIstDate } from "@/lib/freshness";
import { formatInr, formatOpeningHours, scopeLabel, type OpeningHours } from "@/lib/lounges";

import { useLounge } from "./use-lounges";

export function LoungeGuide({ slug }: { slug: string }) {
  const lounge = useLounge(slug);
  if (lounge.isError && lounge.data === undefined) {
    return (
      <ErrorState
        title="Couldn't load this lounge"
        description="The data service didn't respond. It may still be starting up."
        onRetry={() => void lounge.refetch()}
      />
    );
  }
  if (lounge.data === undefined) {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {lounge.waking
            ? "Waking the data server. This can take up to a minute…"
            : "Loading lounge…"}
        </p>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (lounge.data === null) {
    return (
      <EmptyState
        icon={SearchX}
        title="Lounge not found"
        description="It may have been renamed or removed."
      >
        <Button asChild variant="outline">
          <Link href="/lounges">All lounges</Link>
        </Button>
      </EmptyState>
    );
  }
  return <Guide lounge={lounge.data} />;
}

function Guide({ lounge: l }: { lounge: LoungeDetail }) {
  const hours = formatOpeningHours(l.opening_hours as OpeningHours);
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <Link
          href="/lounges"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> All lounges
        </Link>
        <p className="font-mono text-sm text-primary">
          <Link href={`/airports/${l.iata}`} className="hover:underline">
            {l.iata}
          </Link>
          {l.terminal ? <span className="text-muted-foreground"> · {l.terminal}</span> : null}
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{l.name}</h1>
        <p className="text-muted-foreground">{l.airport_name}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{scopeLabel(l.scope)}</Badge>
          <Badge variant="outline">
            {l.side === "airside" ? "After security" : "Before security"}
          </Badge>
        </div>
        <ProvenanceLine provenance={l.provenance} />
      </header>

      <section aria-labelledby="where-heading" className="rounded-xl border bg-card p-5">
        <h2 id="where-heading" className="mb-4 flex items-center gap-2 font-semibold">
          <MapPin aria-hidden="true" className="size-4 text-primary" /> Where and when
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Terminal" value={l.terminal} missingReason="Not stated by the source" />
          <Field label="Operator" value={l.operator} missingReason="Not stated by the source" />
          <Field
            label="Location"
            value={l.location_text}
            missingReason="Not stated by the source"
          />
          <Field
            label="Nearest gate"
            value={l.nearest_gate}
            missingReason="Not stated by the source"
          />
          <Field
            label="Opening hours"
            value={
              hours
                ? hours.map((h) => (
                    <span key={h} className="block">
                      {h}
                    </span>
                  ))
                : null
            }
            missingReason="Not yet verified"
          />
        </dl>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <Clock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Hours and access rules change. Check with the lounge before you go.
        </p>
      </section>

      <section aria-labelledby="access-heading" className="space-y-3">
        <h2 id="access-heading" className="flex items-center gap-2 text-xl font-semibold">
          <Ticket aria-hidden="true" className="size-5 text-primary" /> Ways in
        </h2>
        {l.accepts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No access programmes recorded yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {l.accepts.map((a) => {
              const current = !a.valid_to || a.valid_to > new Date().toISOString().slice(0, 10);
              return (
                <li key={`${a.program.key}-${a.valid_from}`} className="space-y-1 p-4">
                  <p className="font-medium">
                    {a.program.url ? (
                      <a
                        href={a.program.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {a.program.name}
                      </a>
                    ) : (
                      a.program.name
                    )}
                    {!current ? (
                      <Badge variant="outline" className="ml-2">
                        Ended
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    From {formatIstDate(a.valid_from)}
                    {a.valid_to ? ` until ${formatIstDate(a.valid_to)}` : ""}
                    {a.paid_price !== null && a.currency
                      ? ` · ${a.currency === "INR" ? formatInr(a.paid_price) : `${a.currency} ${a.paid_price}`}`
                      : ""}
                    {a.paid_duration_min ? ` for ${a.paid_duration_min} min` : ""}
                  </p>
                  <ProvenanceLine provenance={a.provenance} />
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-sm">
          <Link
            href={`/cards?airport=${l.iata}`}
            className="underline underline-offset-2 hover:text-primary"
          >
            Check which of your cards get you in
          </Link>
        </p>
      </section>

      <section aria-labelledby="amenities-heading" className="space-y-3">
        <h2 id="amenities-heading" className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles aria-hidden="true" className="size-5 text-primary" /> Amenities
        </h2>
        {l.amenities.length === 0 ? (
          <p className="text-sm text-muted-foreground">None stated by the source.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {l.amenities.map((a) => (
              <li key={a.code}>
                <Badge variant="outline">{a.label}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Listed only when the source states them. A missing amenity means &quot;not stated&quot;,
          not &quot;not available&quot;.
        </p>
      </section>
    </article>
  );
}
