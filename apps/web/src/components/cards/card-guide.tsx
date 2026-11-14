"use client";

import { ExternalLink, History, SearchX, Sofa } from "lucide-react";
import Link from "next/link";

import { ProvenanceLine } from "@/components/airports/provenance-line";
import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { VerificationStatus } from "@/components/data/verification-status";
import { WakingMessage } from "@/components/data/waking-message";
import { Breadcrumbs } from "@/components/lounges/breadcrumbs";
import { useCard, useCardLounges } from "@/components/lounges/use-lounges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CardDetail, LoungeSummary, PolicyOut, ScopePrograms } from "@/lib/api/client";
import { formatIstDate, type VerificationState } from "@/lib/freshness";
import { entryLabel, formatInr, groupLoungesByAirport, sideLabel } from "@/lib/lounges";

const WINDOW_LABEL: Record<string, string> = {
  previous_month: "previous month",
  previous_calendar_quarter: "previous calendar quarter",
  previous_billing_quarter: "previous billing quarter",
  previous_year: "previous year",
  current_year: "current year",
};

/** One rule in plain words. Unknown shapes are shown raw rather than dropped. */
export function describeRule(
  rule: Record<string, unknown>,
  programName: (key: string) => string = (k) => k,
): string {
  const r = rule as Record<string, never>;
  switch (rule.type) {
    case "program_entitlement":
      return `Access through ${programName(String(r.program))}`;
    case "visit_quota":
      return `${r.count} visit${r.count === 1 ? "" : "s"} per ${r.period}`;
    case "spend_gate":
      return `Spend at least ${formatInr(r.amount)} in the ${WINDOW_LABEL[r.window] ?? r.window}`;
    case "guest_allowance":
      return `${r.count} guest${r.count === 1 ? "" : "s"} included${r.period ? ` per ${r.period}` : ""}`;
    case "airport_restriction": {
      const only = (r.only as string[] | undefined) ?? [];
      const exclude = (r.exclude as string[] | undefined) ?? [];
      return [
        only.length ? `Only at ${only.join(", ")}` : "",
        exclude.length ? `Not at ${exclude.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ");
    }
    case "entry_method":
      return entryLabel(String(r.method));
    default:
      return JSON.stringify(rule);
  }
}

export function CardGuide({ slug }: { slug: string }) {
  const card = useCard(slug);
  if (card.isError && card.data === undefined) {
    return (
      <ErrorState
        title="Couldn't load this card"
        description="The data service didn't respond. It may still be starting up."
        onRetry={() => void card.refetch()}
      />
    );
  }
  if (card.data === undefined) {
    return (
      <div aria-busy="true" className="space-y-4">
        {card.waking ? (
          <WakingMessage />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading card…
          </p>
        )}
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (card.data === null) {
    return (
      <EmptyState
        icon={SearchX}
        title="Card not found"
        description="It may have been renamed or removed."
      >
        <Button asChild variant="outline">
          <Link href="/cards">All cards</Link>
        </Button>
      </EmptyState>
    );
  }
  return <Guide card={card.data} />;
}

function Guide({ card: c }: { card: CardDetail }) {
  const scopes = ["domestic", "international"] as const;
  const names = new Map(c.programs.flatMap((s) => s.programs.map((p) => [p.key, p.name])));
  const programName = (key: string) => names.get(key) ?? key;
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <Breadcrumbs
          items={[
            { label: "Cards", href: "/cards" },
            { label: c.bank.name, href: `/cards?bank=${c.bank.slug}#cards` },
            { label: c.name },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          {c.bank.name} · {c.network ?? "Network not stated by the bank"}
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{c.name}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={c.product_url} target="_blank" rel="noopener noreferrer">
              Bank&apos;s card page <ExternalLink aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
          <Button asChild>
            <Link href={`/cards?card=${c.slug}`}>Check at an airport</Link>
          </Button>
        </div>
        <ProvenanceLine provenance={c.provenance} />
      </header>

      {scopes.map((scope) => {
        const versions = c.policies.filter((p) => p.scope === scope);
        return (
          <section key={scope} aria-labelledby={`${scope}-heading`} className="space-y-3">
            <h2 id={`${scope}-heading`} className="text-xl font-semibold capitalize">
              {scope} lounges
            </h2>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No {scope} lounge benefit recorded.</p>
            ) : (
              <ol className="space-y-3">
                {versions.map((p) => (
                  <li key={p.valid_from}>
                    <PolicyCard policy={p} programName={programName} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
      <CardLoungesSection card={c} />

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <History aria-hidden="true" className="size-3.5" />
        Benefits are versioned: when the bank changes them, the old version stays here with its
        dates.
      </p>
    </article>
  );
}

function PolicyCard({
  policy: p,
  programName,
}: {
  policy: PolicyOut;
  programName: (key: string) => string;
}) {
  return (
    <div
      className={
        p.in_force
          ? "rounded-xl border bg-card p-5"
          : "rounded-xl border border-dashed p-5 opacity-80"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={p.in_force ? "default" : "outline"}>
          {p.in_force ? "In force" : "Not in force"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          From {formatIstDate(p.valid_from)}
          {p.valid_to ? ` until ${formatIstDate(p.valid_to)}` : ""}
        </span>
      </div>
      <p className="mt-2 text-sm">{p.summary}</p>
      {p.rules.length ? (
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted-foreground">
          {p.rules.map((r, i) => (
            <li key={i}>
              {describeRule(r, programName)}
              {r.ambiguous ? (
                <span className="text-warning"> (the bank&apos;s wording is unclear)</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {p.unmodelled_terms ? (
        <p className="mt-3 rounded-md bg-muted p-2 text-xs">
          Also in the terms, not checked automatically: {p.unmodelled_terms}
        </p>
      ) : null}
      <ProvenanceLine provenance={p.provenance} className="mt-3" />
    </div>
  );
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Scopes of the card under which this lounge's programmes are accepted. */
function scopesFor(lounge: LoungeSummary, scopes: ScopePrograms[]) {
  const keys = new Set(lounge.programs.map((p) => p.key));
  return scopes
    .filter((s) => lounge.scope === "both" || lounge.scope === s.scope)
    .map((s) => ({ scope: s.scope, via: s.programs.filter((p) => keys.has(p.key)) }))
    .filter((s) => s.via.length);
}

/** Lounges whose programmes this card's benefits name today, grouped by airport. */
function CardLoungesSection({ card: c }: { card: CardDetail }) {
  const result = useCardLounges(c.slug);
  const scopes = result.data?.scopes ?? c.programs;
  const lounges = result.data?.lounges ?? [];
  const groups = groupLoungesByAirport(lounges);

  return (
    <section aria-labelledby="card-lounges-heading" className="space-y-3">
      <h2 id="card-lounges-heading" className="flex items-center gap-2 text-xl font-semibold">
        <Sofa aria-hidden="true" className="size-5 text-primary" /> Lounges this card opens
      </h2>
      <p className="text-sm text-muted-foreground">
        Departure lounges that accept a programme this card&apos;s benefit names today. Spend, visit
        and other conditions still apply.
      </p>

      {scopes.length ? (
        <ul className="space-y-1 text-sm">
          {scopes.map((s) => {
            const names = s.programs.map((p) => p.name);
            return (
              <li key={s.scope}>
                <span className="font-medium capitalize">{s.scope}:</span>{" "}
                {names.length ? `through ${listNames(names)}` : "no programme named"}
                {names.length && !s.lounge_list_known ? (
                  <span className="block text-muted-foreground">
                    We don&apos;t have {listNames(names)}&apos;s lounge list yet.
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          The benefit in force today doesn&apos;t name a lounge programme we track.
        </p>
      )}

      {result.isError && result.data === undefined ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load the lounge list right now.{" "}
          <button
            type="button"
            onClick={() => void result.refetch()}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Try again
          </button>
        </p>
      ) : result.data === undefined ? (
        result.waking ? (
          <WakingMessage />
        ) : (
          <Skeleton className="h-24 rounded-xl" />
        )
      ) : groups.length === 0 ? (
        scopes.some((s) => s.programs.length && s.lounge_list_known) ? (
          <p className="text-sm text-muted-foreground">
            None of the lounges we list accept these programmes yet.
          </p>
        ) : null
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {lounges.length} lounge{lounges.length === 1 ? "" : "s"} at {groups.length} airport
            {groups.length === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <li key={g.iata} className="rounded-xl border bg-card p-4">
                <h3 className="mb-1 text-sm font-semibold">
                  <Link href={`/airports/${g.iata}`} className="hover:underline">
                    {g.city ?? g.airportName}{" "}
                    <span className="font-mono text-primary">({g.iata})</span>
                  </Link>
                </h3>
                <ul>
                  {g.lounges.map((l) => {
                    const via = scopesFor(l, scopes);
                    return (
                      <li key={l.slug}>
                        <Link
                          href={`/lounges/${l.slug}`}
                          className="group -mx-2 flex min-h-11 flex-col justify-center rounded-md px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="text-sm font-medium group-hover:underline">
                            {l.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {[l.terminal ?? "Terminal not stated", sideLabel(l.side)].join(" · ")}
                            {via.length
                              ? ` · ${via
                                  .map(
                                    (v) =>
                                      `${v.scope === "domestic" ? "Domestic" : "International"} via ${v.via.map((p) => p.name).join(", ")}`,
                                  )
                                  .join("; ")}`
                              : ""}
                          </span>
                          {l.status !== "verified" ? (
                            <VerificationStatus
                              status={l.status as VerificationState}
                              className="mt-1 self-start"
                            />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
      <Button asChild variant="outline">
        <Link href={`/cards?card=${c.slug}`}>Check at an airport</Link>
      </Button>
    </section>
  );
}
