"use client";

import { ChevronDown, CircleCheck, CircleHelp, CircleX, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";

import { EligibilityBadge } from "@/components/lounges/eligibility-badge";
import type { CheckOut, EligibilityResponse, EligibilityStatus } from "@/lib/api/client";
import { formatTravelDate, resultsByLounge, type CardVerdict, type LoungeRow } from "@/lib/checker";
import { entryLabel } from "@/lib/lounges";
import { cn } from "@/lib/utils";

const CHECK_ICON: Record<EligibilityStatus, { icon: LucideIcon; label: string; tone: string }> = {
  yes: { icon: CircleCheck, label: "Met", tone: "text-success" },
  no: { icon: CircleX, label: "Not met", tone: "text-destructive" },
  depends: { icon: CircleHelp, label: "Not sure", tone: "text-warning" },
};

const headingClass = "scroll-mt-20 text-xl font-semibold outline-none";

export function CheckerResults({
  data,
  submittedAirport,
  airportName,
  stale,
  headingRef,
  showAllChecks,
}: {
  data: EligibilityResponse | null;
  submittedAirport: string;
  airportName: string;
  stale: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  showAllChecks: boolean;
}) {
  if (data === null) {
    return (
      <section aria-labelledby="results-heading" className="space-y-2">
        <h2 id="results-heading" ref={headingRef} tabIndex={-1} className={headingClass}>
          No airport with the code {submittedAirport}
        </h2>
        <p className="text-sm text-muted-foreground">
          We don&apos;t list an airport with that code. Pick one from the list, or check the
          three-letter code on your ticket.
        </p>
      </section>
    );
  }

  const rows = resultsByLounge(data);
  const first = rows[0]?.lounge;
  const place = first ? `${first.city ?? first.airport_name} (${data.airport})` : airportName;
  const counts = { yes: 0, depends: 0, no: 0 };
  rows.forEach((r) => counts[r.best]++);

  return (
    <section aria-labelledby="results-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="results-heading" ref={headingRef} tabIndex={-1} className={headingClass}>
          {place} · {data.scope === "international" ? "International" : "Domestic"} ·{" "}
          {formatTravelDate(data.on)}
        </h2>
        {rows.length ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {rows.length} lounge{rows.length === 1 ? "" : "s"}: {counts.yes} likely yes,{" "}
            {counts.depends} depends, {counts.no} no.
          </p>
        ) : null}
      </div>

      {stale ? (
        <p
          role="status"
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          These results are for your earlier choices. Press Check again to update them.
        </p>
      ) : null}

      {data.unknown_cards.length ? (
        <p className="text-sm">
          We couldn&apos;t find {data.unknown_cards.length === 1 ? "this card" : "these cards"}:{" "}
          {data.unknown_cards.join(", ")}. Remove {data.unknown_cards.length === 1 ? "it" : "them"}{" "}
          and pick again from the list.
        </p>
      ) : null}

      <div className={cn("space-y-3 transition-opacity", stale && "opacity-60")}>
        {data.lounges_listed === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm">
            We have no departure lounges recorded at {data.airport} yet, so there&apos;s nothing to
            check against.
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm">
            None of the lounges we list at {data.airport} could be checked for these cards.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.lounge.slug}>
                <LoungeResultRow row={row} open={showAllChecks} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
    </section>
  );
}

function LoungeResultRow({ row, open }: { row: LoungeRow; open: boolean }) {
  const l = row.lounge;
  return (
    <article aria-labelledby={`lounge-${l.slug}`} className="rounded-xl border bg-card p-4">
      <h3 id={`lounge-${l.slug}`} className="font-medium">
        <Link href={`/lounges/${l.slug}`} className="hover:underline">
          {l.name}
        </Link>
      </h3>
      <p className="text-sm text-muted-foreground">
        {l.terminal ?? "Terminal not stated"} ·{" "}
        {l.side === "airside" ? "After security" : "Before security"}
      </p>
      <ul className="mt-3 space-y-2">
        {row.verdicts.map((v) => (
          <li key={v.card.slug}>
            <CardVerdictItem verdict={v} open={open} />
          </li>
        ))}
      </ul>
    </article>
  );
}

function CardVerdictItem({
  verdict: { card, result: r },
  open,
}: {
  verdict: CardVerdict;
  open: boolean;
}) {
  return (
    <details open={open} className="group rounded-lg border bg-background">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <EligibilityBadge status={r.status} />
        <span className="min-w-0 flex-1 text-sm">
          {card.name}
          <span className="text-muted-foreground"> · {card.bank.name}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
        <span className="sr-only">Why</span>
      </summary>
      <div className="space-y-2 border-t px-3 py-3">
        <ul className="space-y-2">
          {r.checks.map((c, i) => (
            <CheckLine key={i} check={c} />
          ))}
        </ul>
        {r.notes.map((n, i) => (
          <p key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {n}
          </p>
        ))}
        {r.entry.length ? (
          <p className="text-xs text-muted-foreground">
            How to get in: {r.entry.map(entryLabel).join("; ")}
          </p>
        ) : null}
        {r.policy_summary ? (
          <p className="text-xs text-muted-foreground">Benefit: {r.policy_summary}</p>
        ) : null}
        <p className="text-xs">
          <Link
            href={`/cards/${card.slug}`}
            className="underline underline-offset-2 hover:text-primary"
          >
            {card.name}: full benefit and sources
          </Link>
        </p>
      </div>
    </details>
  );
}

function CheckLine({ check: c }: { check: CheckOut }) {
  const { icon: Icon, label, tone } = CHECK_ICON[c.status];
  return (
    <li className="text-sm">
      <span className="flex items-start gap-2">
        <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", tone)} />
        <span>
          <span className="sr-only">{label}: </span>
          {c.message}
        </span>
      </span>
      {c.detail ? (
        <details className="group/detail mt-1 ml-6">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded text-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <span className="group-open/detail:hidden">Show the bank&apos;s wording</span>
            <span className="hidden group-open/detail:inline">Hide the bank&apos;s wording</span>
          </summary>
          <blockquote className="mt-1 max-h-60 overflow-y-auto border-l-2 pl-3 text-xs whitespace-pre-line text-muted-foreground">
            {c.detail}
          </blockquote>
        </details>
      ) : null}
    </li>
  );
}
