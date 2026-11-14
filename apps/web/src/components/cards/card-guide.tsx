"use client";

import { ArrowLeft, ExternalLink, History, SearchX } from "lucide-react";
import Link from "next/link";

import { ProvenanceLine } from "@/components/airports/provenance-line";
import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { useCard } from "@/components/lounges/use-lounges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CardDetail, PolicyOut } from "@/lib/api/client";
import { formatIstDate } from "@/lib/freshness";
import { entryLabel, formatInr } from "@/lib/lounges";

const WINDOW_LABEL: Record<string, string> = {
  previous_month: "previous month",
  previous_calendar_quarter: "previous calendar quarter",
  previous_billing_quarter: "previous billing quarter",
  previous_year: "previous year",
  current_year: "current year",
};

/** One rule in plain words. Unknown shapes are shown raw rather than dropped. */
export function describeRule(rule: Record<string, unknown>): string {
  const r = rule as Record<string, never>;
  switch (rule.type) {
    case "program_entitlement":
      return `Access through ${r.program}`;
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
    return <Skeleton className="h-48 rounded-xl" />;
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
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <Link
          href="/cards"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> All cards
        </Link>
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
            <Link href={`/cards?card=${c.slug}`}>Check lounge access</Link>
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
                    <PolicyCard policy={p} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <History aria-hidden="true" className="size-3.5" />
        Benefits are versioned: when the bank changes them, the old version stays here with its
        dates.
      </p>
    </article>
  );
}

function PolicyCard({ policy: p }: { policy: PolicyOut }) {
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
              {describeRule(r)}
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
