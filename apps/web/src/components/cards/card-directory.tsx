"use client";

import { CreditCard, ExternalLink } from "lucide-react";
import Link from "next/link";

import { ErrorState } from "@/components/data/error-state";
import { VerificationStatus } from "@/components/data/verification-status";
import { ContributeButton } from "@/components/lounges/lounge-list";
import { useCards } from "@/components/lounges/use-lounges";
import { Skeleton } from "@/components/ui/skeleton";
import type { CardSummary } from "@/lib/api/client";
import type { VerificationState } from "@/lib/freshness";

/** Cards grouped by bank. Banks without recorded cards say so instead of disappearing. */
export function CardDirectory() {
  const cards = useCards();

  if (cards.isError && !cards.data) {
    return (
      <ErrorState
        title="Couldn't load cards"
        description="The data service didn't respond. It may still be starting up."
        onRetry={() => void cards.refetch()}
      />
    );
  }
  if (!cards.data) {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {cards.waking
            ? "Waking the data server. This can take up to a minute…"
            : "Loading cards…"}
        </p>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  const byBank = new Map<string, CardSummary[]>();
  for (const c of cards.data.items)
    byBank.set(c.bank.slug, [...(byBank.get(c.bank.slug) ?? []), c]);

  return (
    <div className="space-y-4">
      {cards.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          <p>
            No card lounge benefits are recorded yet. Each one must be read from the bank&apos;s own
            page and checked by a person, so the list starts empty rather than guessed. The first
            set will be the top travel cards of these five issuers.
          </p>
          <div className="mt-3">
            <ContributeButton label="Add a card" />
          </div>
        </div>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.data.banks.map((bank) => {
          const list = byBank.get(bank.slug) ?? [];
          return (
            <li key={bank.slug} className="rounded-xl border bg-card p-4">
              <p className="flex items-center justify-between gap-2 font-semibold">
                {bank.name}
                <a
                  href={bank.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`${bank.name} website (opens in a new tab)`}
                >
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              </p>
              {list.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No cards recorded yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {list.map((c) => (
                    <li key={c.slug}>
                      <Link
                        href={`/cards/${c.slug}`}
                        className="group -m-1 flex items-start gap-2 rounded-md p-1 hover:bg-muted"
                      >
                        <CreditCard
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium group-hover:underline">
                            {c.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">{c.network}</span>
                          <VerificationStatus
                            status={c.status as VerificationState}
                            className="mt-1"
                          />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
