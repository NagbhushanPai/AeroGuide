"use client";

import { ExternalLink, GitPullRequest, Sofa } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { VerificationStatus } from "@/components/data/verification-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LoungeSummary } from "@/lib/api/client";
import type { VerificationState } from "@/lib/freshness";
import { scopeLabel } from "@/lib/lounges";
import { siteConfig } from "@/lib/site";

import { useLounges } from "./use-lounges";

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
        <Badge variant="outline">{scopeLabel(l.scope)}</Badge>
        <Badge variant="outline">
          {l.side === "airside" ? "After security" : "Before security"}
        </Badge>
        <VerificationStatus status={l.status as VerificationState} />
      </div>
      {l.programs.length ? (
        <p className="mt-2 text-xs text-muted-foreground">Accepts: {l.programs.join(", ")}</p>
      ) : null}
    </Link>
  );
}

/** All lounges we have records for, grouped by airport. */
export function LoungeDirectory() {
  const lounges = useLounges();

  if (lounges.isError && !lounges.data) {
    return (
      <ErrorState
        title="Couldn't load lounges"
        description="The data service didn't respond. It may still be starting up."
        onRetry={() => void lounges.refetch()}
      />
    );
  }
  if (!lounges.data) {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {lounges.waking
            ? "Waking the data server. On the free tier this can take up to a minute…"
            : "Loading lounges…"}
        </p>
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }
  if (lounges.data.items.length === 0) {
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

  const byAirport = new Map<string, LoungeSummary[]>();
  for (const l of lounges.data.items) byAirport.set(l.iata, [...(byAirport.get(l.iata) ?? []), l]);
  return (
    <div className="space-y-8">
      {[...byAirport].map(([iata, items]) => (
        <section key={iata} aria-labelledby={`lounges-${iata}`}>
          <h2 id={`lounges-${iata}`} className="mb-3 font-semibold">
            <Link href={`/airports/${iata}`} className="font-mono text-primary hover:underline">
              {iata}
            </Link>{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {items.length} lounge{items.length === 1 ? "" : "s"}
            </span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((l) => (
              <li key={l.slug}>
                <LoungeCard lounge={l} showAirport={false} />
              </li>
            ))}
          </ul>
        </section>
      ))}
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
        <Skeleton className="h-24 rounded-xl" />
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
          <p className="text-sm">
            <Link
              href={`/cards?airport=${iata}`}
              className="underline underline-offset-2 hover:text-primary"
            >
              Check which of your cards get you in
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
