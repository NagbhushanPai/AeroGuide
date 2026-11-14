"use client";

import { BadgeCheck, ChevronRight, CreditCard, ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { ErrorState } from "@/components/data/error-state";
import { VerificationStatus } from "@/components/data/verification-status";
import { WakingMessage } from "@/components/data/waking-message";
import { ContributeButton } from "@/components/lounges/lounge-list";
import { useCards } from "@/components/lounges/use-lounges";
import { FilterChip } from "@/components/search/filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import type { BankRef, CardSummary } from "@/lib/api/client";
import { groupByBank, matchCards, networksOf } from "@/lib/card-search";
import type { VerificationState } from "@/lib/freshness";
import { replaceParams } from "@/lib/url-state";

const DEBOUNCE_MS = 200;
const selectClass =
  "h-10 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto sm:text-sm";

/** Cards grouped by bank, with text, bank, network and "checked by us" filters in the URL. */
export function CardDirectory() {
  const cards = useCards();
  const params = useSearchParams();
  const id = useId();

  const bank = params.get("bank") ?? "";
  const network = params.get("network") ?? "";
  const verifiedOnly = params.get("verified") === "1";
  const urlQ = params.get("q") ?? "";
  const [text, setText] = useState(urlQ);

  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== urlQ) replaceParams({ q: text.trim() || null });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // Only typing starts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const items = useMemo(() => cards.data?.items ?? [], [cards.data]);
  const networks = useMemo(() => networksOf(items), [items]);
  const filtered = useMemo(
    () =>
      matchCards(items, urlQ).filter(
        (c) =>
          (!bank || c.bank.slug === bank) &&
          (!network || c.network === network) &&
          (!verifiedOnly || c.status === "verified"),
      ),
    [items, urlQ, bank, network, verifiedOnly],
  );

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
      <div aria-busy="true" className="space-y-3">
        {cards.waking ? (
          <WakingMessage />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading cards…
          </p>
        )}
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const banks = cards.data.banks;
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          <p>
            No card lounge benefits are recorded yet. Each one must be read from the bank&apos;s own
            page and checked by a person, so the list starts empty rather than guessed. The first
            set will be the top travel cards of these {banks.length} issuers.
          </p>
          <div className="mt-3">
            <ContributeButton label="Add a card" />
          </div>
        </div>
        <BanksWithoutCards banks={banks} />
      </div>
    );
  }

  const filtering = !!(urlQ || bank || network || verifiedOnly);
  const groups = filtering
    ? groupByBank(filtered)
    : banks
        .map((b) => ({ bank: b, cards: filtered.filter((c) => c.bank.slug === b.slug) }))
        .filter((g) => g.cards.length);
  const emptyBanks = filtering
    ? []
    : banks.filter((b) => !items.some((c) => c.bank.slug === b.slug));
  const verifiedCount = items.filter((c) => c.status === "verified").length;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="relative block flex-1">
            <span className="sr-only">Search cards</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Card or bank name"
              className="h-10 w-full rounded-md border bg-background pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
            />
          </label>
          <div>
            <label htmlFor={`${id}-bank`} className="mb-1 block text-xs text-muted-foreground">
              Bank
            </label>
            <select
              id={`${id}-bank`}
              value={bank}
              onChange={(e) => replaceParams({ bank: e.target.value || null })}
              className={selectClass}
            >
              <option value="">All banks ({banks.length})</option>
              {banks.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div role="group" aria-label="Filter cards" className="flex flex-wrap items-center gap-2">
          <FilterChip pressed={!network} onClick={() => replaceParams({ network: null })}>
            Any network
          </FilterChip>
          {networks.map((n) => (
            <FilterChip
              key={n}
              pressed={network === n}
              onClick={() => replaceParams({ network: network === n ? null : n })}
            >
              {n}
            </FilterChip>
          ))}
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <FilterChip
            pressed={verifiedOnly}
            onClick={() => replaceParams({ verified: verifiedOnly ? null : "1" })}
          >
            <BadgeCheck aria-hidden="true" className="size-4" /> Checked by AeroGuide (
            {verifiedCount})
          </FilterChip>
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {filtering
            ? `${filtered.length} of ${items.length} cards`
            : `${items.length} cards from ${banks.length} banks`}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          No cards match these filters.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setText("");
              replaceParams({ q: null, bank: null, network: null, verified: null });
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <BankSection key={g.bank.slug} bank={g.bank} cards={g.cards} />
          ))}
        </div>
      )}
      <BanksWithoutCards banks={emptyBanks} />
    </div>
  );
}

function BankSection({ bank, cards }: { bank: BankRef; cards: CardSummary[] }) {
  const headingId = `bank-${bank.slug}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id={headingId} className="font-semibold">
          {bank.name}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {cards.length} card{cards.length === 1 ? "" : "s"}
          </span>
        </h3>
        <a
          href={bank.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Bank website <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only"> for {bank.name} (opens in a new tab)</span>
        </a>
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {cards.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/cards/${c.slug}`}
              className="group flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <CreditCard aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium group-hover:underline">{c.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{c.network ?? "Network not stated"}</span>
                  <VerificationStatus status={c.status as VerificationState} />
                </span>
                {c.domestic ? (
                  <span className="mt-1 line-clamp-1 hidden text-xs text-muted-foreground sm:block">
                    Domestic: {c.domestic}
                  </span>
                ) : null}
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BanksWithoutCards({ banks }: { banks: BankRef[] }) {
  if (!banks.length) return null;
  return (
    <p className="text-sm text-muted-foreground">
      No cards recorded yet for:{" "}
      {banks.map((b, i) => (
        <span key={b.slug}>
          {i ? ", " : ""}
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {b.name}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </span>
      ))}
      .
    </p>
  );
}
