"use client";

import { useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { ErrorState } from "@/components/data/error-state";
import { EligibilityBadge } from "@/components/lounges/eligibility-badge";
import { useCards } from "@/components/lounges/use-lounges";
import { useMapAirports } from "@/components/live/airport-search";
import { Button } from "@/components/ui/button";
import {
  checkEligibility,
  type EligibilityRequest,
  type EligibilityResponse,
} from "@/lib/api/client";
import { entryLabel } from "@/lib/lounges";

type CardFacts = { visits: string; spend: string };

const inputClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function toInt(value: string): number | undefined {
  const n = Number(value.replace(/[,\s₹]/g, ""));
  return value.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * "Can I get into a lounge with my cards?" Everything here lives in React state only: nothing is
 * written to the URL, browser storage or a server log. The API receives card product names, never
 * card numbers.
 */
export function LoungeChecker() {
  const params = useSearchParams();
  const cards = useCards();
  const airports = useMapAirports();
  const formId = useId();

  const [selected, setSelected] = useState<string[]>(() => {
    const c = params.get("card");
    return c ? [c] : [];
  });
  const [airport, setAirport] = useState(() => (params.get("airport") ?? "").toUpperCase());
  const [on, setOn] = useState("");
  const [scope, setScope] = useState<"domestic" | "international">("domestic");
  const [guests, setGuests] = useState("0");
  const [facts, setFacts] = useState<Record<string, CardFacts>>({});

  const check = useMutation({
    mutationFn: (body: EligibilityRequest) => checkEligibility(body),
  });

  const airportOptions = useMemo(
    () =>
      (airports.data ?? []).map((a) => ({
        value: a.iata,
        label: `${a.iata} · ${a.city ?? a.name}`,
      })),
    [airports.data],
  );
  const cardList = cards.data?.items ?? [];
  const airportValid = /^[A-Z]{3}$/.test(airport);
  const canSubmit = selected.length > 0 && airportValid && !check.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const factMap: NonNullable<EligibilityRequest["facts"]> = {};
    for (const slug of selected) {
      const f = facts[slug];
      if (!f) continue;
      const visits = toInt(f.visits);
      const spend = toInt(f.spend);
      if (visits !== undefined || spend !== undefined) {
        factMap[slug] = { visits_used: visits ?? null, spend_inr: spend ?? null };
      }
    }
    check.mutate({
      cards: selected,
      airport,
      on: on || null,
      scope,
      guests: toInt(guests) ?? 0,
      facts: factMap,
    });
  }

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
        Nothing you enter is saved: not on our server, not in your browser. We never ask for card
        numbers, only which cards you hold.
      </p>

      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border bg-card p-5"
        aria-labelledby={`${formId}-title`}
      >
        <h2 id={`${formId}-title`} className="font-semibold">
          Check lounge access
        </h2>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Your cards</legend>
          {cards.isError && !cards.data ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load the card list.</p>
          ) : !cards.data ? (
            <p className="text-sm text-muted-foreground">Loading cards…</p>
          ) : cardList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cards are recorded yet, so there&apos;s nothing to check against. They&apos;re
              being added through reviewed pull requests.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {cardList.map((c) => {
                const checked = selected.includes(c.slug);
                return (
                  <li key={c.slug} className="rounded-md border p-2">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelected((s) =>
                            checked ? s.filter((x) => x !== c.slug) : [...s, c.slug],
                          )
                        }
                        className="mt-0.5 size-4"
                      />
                      <span>
                        {c.name}
                        <span className="block text-xs text-muted-foreground">{c.bank.name}</span>
                      </span>
                    </label>
                    {checked ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                        <label className="text-xs text-muted-foreground">
                          Visits used this period
                          <input
                            inputMode="numeric"
                            value={facts[c.slug]?.visits ?? ""}
                            onChange={(e) =>
                              setFacts((f) => ({
                                ...f,
                                [c.slug]: { visits: e.target.value, spend: f[c.slug]?.spend ?? "" },
                              }))
                            }
                            placeholder="optional"
                            className={inputClass}
                          />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Spend in the bank&apos;s window (₹)
                          <input
                            inputMode="numeric"
                            value={facts[c.slug]?.spend ?? ""}
                            onChange={(e) =>
                              setFacts((f) => ({
                                ...f,
                                [c.slug]: {
                                  spend: e.target.value,
                                  visits: f[c.slug]?.visits ?? "",
                                },
                              }))
                            }
                            placeholder="optional"
                            className={inputClass}
                          />
                        </label>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium">
            Airport
            <input
              list={`${formId}-airports`}
              value={airport}
              onChange={(e) => setAirport(e.target.value.trim().toUpperCase().slice(0, 3))}
              placeholder="DEL"
              aria-invalid={airport !== "" && !airportValid}
              className={`${inputClass} mt-1 font-mono uppercase`}
            />
            <datalist id={`${formId}-airports`}>
              {airportOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </datalist>
          </label>
          <label className="text-sm font-medium">
            Travel date
            <input
              type="date"
              value={on}
              onChange={(e) => setOn(e.target.value)}
              className={`${inputClass} mt-1`}
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Empty means today
            </span>
          </label>
          <fieldset className="text-sm">
            <legend className="font-medium">Flight</legend>
            <div className="mt-2 flex gap-4">
              {(["domestic", "international"] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 capitalize">
                  <input
                    type="radio"
                    name={`${formId}-scope`}
                    checked={scope === s}
                    onChange={() => setScope(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-medium">
            Guests with you
            <input
              inputMode="numeric"
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>

        <Button type="submit" disabled={!canSubmit}>
          {check.isPending ? "Checking…" : "Check"}
        </Button>
      </form>

      {check.isError ? (
        <ErrorState
          title="Couldn't run the check"
          description="The data service didn't respond. It may still be starting up."
          onRetry={() => check.reset()}
        />
      ) : null}
      {check.data === null ? (
        <p role="status" className="text-sm">
          We don&apos;t list an airport with the code {airport}.
        </p>
      ) : null}
      {check.data ? <Results data={check.data} /> : null}
    </div>
  );
}

function Results({ data }: { data: EligibilityResponse }) {
  return (
    <section aria-labelledby="results-heading" className="space-y-4" aria-live="polite">
      <h2 id="results-heading" className="text-xl font-semibold">
        {data.airport} · {data.scope} · {data.on}
      </h2>
      <p className="text-sm text-muted-foreground">{data.disclaimer}</p>
      {data.unknown_cards.length ? (
        <p className="text-sm">Not found: {data.unknown_cards.join(", ")}</p>
      ) : null}
      {data.lounges_listed === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm">
          We have no lounges recorded at {data.airport} yet, so there&apos;s nothing to check
          against.
        </p>
      ) : (
        data.results.map((r) => (
          <div key={r.card.slug} className="rounded-xl border bg-card">
            <p className="border-b p-4 font-semibold">
              <Link href={`/cards/${r.card.slug}`} className="hover:underline">
                {r.card.name}
              </Link>{" "}
              <span className="text-sm font-normal text-muted-foreground">{r.card.bank.name}</span>
            </p>
            <ul className="divide-y">
              {r.lounges.map((l) => (
                <li key={l.lounge.slug} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <EligibilityBadge status={l.status} />
                    <Link
                      href={`/lounges/${l.lounge.slug}`}
                      className="font-medium hover:underline"
                    >
                      {l.lounge.name}
                    </Link>
                    {l.lounge.terminal ? (
                      <span className="text-sm text-muted-foreground">{l.lounge.terminal}</span>
                    ) : null}
                  </div>
                  <ul className="space-y-0.5 text-sm text-muted-foreground">
                    {l.checks.map((c, i) => (
                      <li key={i} className={c.status === "yes" ? "" : "text-foreground"}>
                        {c.status === "yes" ? "✓ " : c.status === "no" ? "✗ " : "? "}
                        {c.message}
                      </li>
                    ))}
                  </ul>
                  {l.entry.length ? (
                    <p className="text-xs text-muted-foreground">
                      How to get in: {l.entry.map(entryLabel).join("; ")}
                    </p>
                  ) : null}
                  {l.policy_summary ? (
                    <p className="text-xs text-muted-foreground">Benefit: {l.policy_summary}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
