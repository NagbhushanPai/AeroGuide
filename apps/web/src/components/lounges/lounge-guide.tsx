"use client";

import { Clock, CreditCard, MapPin, SearchX, Sparkles, Ticket } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { Field } from "@/components/data/field";
import { VerificationStatus } from "@/components/data/verification-status";
import { WakingMessage } from "@/components/data/waking-message";
import { ProvenanceLine } from "@/components/airports/provenance-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CardAccess, LoungeDetail } from "@/lib/api/client";
import { formatIstDate, type VerificationState } from "@/lib/freshness";
import {
  directionLabel,
  formatInr,
  formatOpeningHours,
  scopeLabel,
  sideLabel,
  type OpeningHours,
} from "@/lib/lounges";

import { Breadcrumbs } from "./breadcrumbs";
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
      <div aria-busy="true" className="space-y-4">
        {lounge.waking ? (
          <WakingMessage />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading lounge…
          </p>
        )}
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
        <Breadcrumbs
          items={[
            { label: "Airports", href: "/airports" },
            { label: `${l.city ?? l.airport_name} (${l.iata})`, href: `/airports/${l.iata}` },
            { label: "Lounges", href: `/lounges?airport=${l.iata}` },
            { label: l.name },
          ]}
        />
        <p className="font-mono text-sm text-primary">
          <Link href={`/airports/${l.iata}`} className="hover:underline">
            {l.iata}
          </Link>
          {l.terminal ? <span className="text-muted-foreground"> · {l.terminal}</span> : null}
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{l.name}</h1>
        <p className="text-muted-foreground">{l.airport_name}</p>
        <div className="flex flex-wrap gap-1.5">
          {l.direction !== "departures" ? (
            <Badge variant="secondary" className="font-semibold">
              {directionLabel(l.direction)}
            </Badge>
          ) : null}
          <Badge variant="outline">{scopeLabel(l.scope)}</Badge>
          <Badge variant="outline">{sideLabel(l.side)}</Badge>
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
              const current = a.in_force;
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
                        Not in force
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
      </section>

      <CardsSection lounge={l} />

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

function checkHref(l: LoungeDetail): string {
  const sp = new URLSearchParams({ airport: l.iata });
  if (l.scope !== "both") sp.set("scope", l.scope);
  return `/cards?${sp}#check`;
}

/** Cards whose benefit names a programme this lounge accepts, grouped by bank. */
function CardsSection({ lounge: l }: { lounge: LoungeDetail }) {
  const heading = (
    <h2 id="cards-heading" className="flex items-center gap-2 text-xl font-semibold">
      <CreditCard aria-hidden="true" className="size-5 text-primary" /> Cards that may get you in
    </h2>
  );
  if (l.direction !== "departures") {
    return (
      <section aria-labelledby="cards-heading" className="space-y-3">
        {heading}
        <p className="text-sm text-muted-foreground">
          This is {l.direction === "arrivals" ? "an arrivals" : "a transit"} lounge. Card lounge
          benefits cover departure lounges, so we don&apos;t match cards to it.
        </p>
      </section>
    );
  }

  const byBank = new Map<string, CardAccess[]>();
  for (const c of l.cards) byBank.set(c.bank, [...(byBank.get(c.bank) ?? []), c]);
  const banks = [...byBank].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <section aria-labelledby="cards-heading" className="space-y-3">
      {heading}
      {l.cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None of the cards we list name a programme this lounge accepts today.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            These cards&apos; benefits name a programme this lounge accepts. Conditions such as
            spend and visit limits still apply.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {banks.map(([bank, list]) => (
              <div key={bank} className="rounded-xl border bg-card p-4">
                <h3 className="mb-2 text-sm font-semibold">{bank}</h3>
                <ul className="space-y-1">
                  {list.map((c) => (
                    <li key={`${c.slug}-${c.scope}-${c.via.key}`}>
                      <Link
                        href={`/cards/${c.slug}`}
                        className="group -mx-2 flex min-h-11 flex-col justify-center rounded-md px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="text-sm font-medium group-hover:underline">{c.name}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            <span className="capitalize">{c.scope}</span>, through {c.via.name}
                          </span>
                          <VerificationStatus status={c.status as VerificationState} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
      <Button asChild>
        <Link href={checkHref(l)}>Check with my cards</Link>
      </Button>
    </section>
  );
}
