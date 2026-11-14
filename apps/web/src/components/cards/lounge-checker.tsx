"use client";

import { useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { WakingMessage } from "@/components/data/waking-message";
import { ErrorState } from "@/components/data/error-state";
import { useCards } from "@/components/lounges/use-lounges";
import { AirportCombobox, airportLabel, useMapAirports } from "@/components/live/airport-search";
import { Button } from "@/components/ui/button";
import { useWaking } from "@/hooks/use-waking";
import { searchMapAirports } from "@/lib/airports";
import {
  ApiError,
  checkEligibility,
  type EligibilityRequest,
  type EligibilityResponse,
} from "@/lib/api/client";
import { contentRetry } from "@/lib/api/retry";
import {
  checkerParamUpdates,
  parseWholeNumber,
  readCheckerParams,
  type Scope,
} from "@/lib/checker";
import {
  forgetSavedCards,
  getSavedCards,
  getServerSavedCards,
  setSavedCards,
  subscribeSavedCards,
} from "@/lib/saved-cards";
import { replaceParams } from "@/lib/url-state";

import { CardPicker } from "./card-picker";
import { CheckerResults } from "./checker-results";

type CardFacts = { visits: string; spend: string };
/** The last answer, with the request it answers (to spot later form changes). */
type Answer = { data: EligibilityResponse | null; key: string; airport: string };

const inputClass =
  "h-10 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive sm:text-sm";

const noopSubscribe = () => () => {};

/**
 * "Can I get into a lounge with my cards?" The card choice (product names only) is remembered in
 * this browser; airport, date and scope live in the URL so refresh and back keep them. Spend and
 * visits stay in memory and go only to the eligibility request. Never card numbers.
 */
export function LoungeChecker() {
  const params = useSearchParams();
  const cards = useCards();
  const airports = useMapAirports();
  const formId = useId();

  const selected = useSyncExternalStore(subscribeSavedCards, getSavedCards, getServerSavedCards);
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [initial] = useState(() => ({ ...readCheckerParams(params), card: params.get("card") }));
  const [airport, setAirport] = useState(initial.airport);
  const [on, setOn] = useState(initial.on);
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [guests, setGuests] = useState("0");
  const [facts, setFacts] = useState<Record<string, CardFacts>>({});
  const [answer, setAnswer] = useState<Answer | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const focusResults = useRef(false);
  const initDone = useRef(false);
  const lastRequest = useRef<EligibilityRequest | null>(null);

  const check = useMutation({
    mutationFn: (body: EligibilityRequest) => checkEligibility(body),
    onSuccess: (data, body) =>
      setAnswer({ data, key: JSON.stringify(body), airport: body.airport }),
    // Retry through a cold start, but not when the API rejected the request itself.
    retry: (failures, error) =>
      !(error instanceof ApiError && error.status < 500) && contentRetry.retry(failures, error),
    retryDelay: contentRetry.retryDelay,
  });
  const waking = useWaking(check.isPending);

  // ---- validation ----
  const guestsParsed = parseWholeNumber(guests, "1");
  const parsedFacts = selected.map((slug) => {
    const f = facts[slug] ?? { visits: "", spend: "" };
    return {
      slug,
      visits: parseWholeNumber(f.visits, "1"),
      spend: parseWholeNumber(f.spend, "50,000"),
    };
  });
  const numbersInvalid =
    !!guestsParsed.error || parsedFacts.some((f) => f.visits.error || f.spend.error);
  const airportValid = /^[A-Z]{3}$/.test(airport);

  const blocker =
    !selected.length && !airportValid
      ? "Pick at least one card and an airport."
      : !selected.length
        ? "Pick at least one card."
        : !airportValid
          ? "Pick an airport from the list, or type its three-letter code."
          : numbersInvalid
            ? "Fix the numbers marked in red."
            : null;

  function buildRequest(): EligibilityRequest {
    const factMap: NonNullable<EligibilityRequest["facts"]> = {};
    for (const f of parsedFacts) {
      if (f.visits.value !== null || f.spend.value !== null) {
        factMap[f.slug] = { visits_used: f.visits.value, spend_inr: f.spend.value };
      }
    }
    return {
      cards: [...selected],
      airport,
      on: on || null,
      scope,
      guests: guestsParsed.value ?? 0,
      facts: factMap,
    };
  }
  const formKey = JSON.stringify(buildRequest());

  function run(body: EligibilityRequest) {
    lastRequest.current = body;
    focusResults.current = true;
    check.mutate(body);
  }

  // ---- first client render: remembered cards, ?card= deep link, auto-run ----
  useEffect(() => {
    if (!hydrated || initDone.current) return;
    initDone.current = true;
    let chosen = getSavedCards();
    const card = initial.card;
    if (card && /^[a-z0-9-]{1,120}$/.test(card)) {
      if (!chosen.includes(card)) setSavedCards([...chosen, card]);
      chosen = getSavedCards();
      replaceParams({ card: null });
      rootRef.current?.scrollIntoView?.({ block: "start" });
    }
    if (chosen.length && initial.airport) {
      run({
        cards: [...chosen],
        airport: initial.airport,
        on: initial.on || null,
        scope: initial.scope,
        guests: 0,
        facts: {},
      });
    }
    // Runs once, after hydration, with the values the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // ---- move focus to the answer when it arrives ----
  useEffect(() => {
    if (!answer || !focusResults.current) return;
    focusResults.current = false;
    const el = resultsRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [answer]);

  function syncUrl(next: Partial<{ airport: string; on: string; scope: Scope }>) {
    replaceParams(checkerParamUpdates({ airport, on, scope, ...next }));
  }

  function changeAirport(code: string) {
    setAirport(code);
    syncUrl({ airport: code });
  }

  function onAirportText(text: string) {
    const t = text.trim().toUpperCase();
    const list = airports.data ?? [];
    if (list.some((a) => a.iata === t)) return changeAirport(t);
    // A code we don't know: allow it, and the answer says so.
    if (/^[A-Z]{3}$/.test(t) && searchMapAirports(list, t).length === 0) return changeAirport(t);
    if (airport) changeAirport("");
  }

  function toggleCard(slug: string) {
    setSavedCards(
      selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug],
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (blocker || check.isPending) return;
    run(buildRequest());
  }

  const cardList = cards.data?.items ?? [];
  const cardsUnavailable =
    cards.isError && !cards.data ? (
      "Couldn't load the card list. Reload the page to try again."
    ) : !cards.data ? (
      cards.waking ? (
        <WakingMessage />
      ) : (
        "Loading cards…"
      )
    ) : cardList.length === 0 ? (
      "No cards are recorded yet, so there's nothing to check against. They're being added through reviewed pull requests."
    ) : null;

  const blockerId = `${formId}-blocker`;
  const factsHelpId = `${formId}-facts-help`;
  const stale = !!answer && answer.key !== formKey;

  return (
    <div ref={rootRef} id="check" className="scroll-mt-20 space-y-6">
      <form
        onSubmit={submit}
        noValidate
        className="space-y-6 rounded-xl border bg-card p-4 sm:p-5"
        aria-labelledby={`${formId}-title`}
      >
        <h2 id={`${formId}-title`} className="text-lg font-semibold">
          Check lounge access
        </h2>

        <div className="space-y-3">
          <CardPicker
            cards={cardList}
            selected={selected}
            onToggle={toggleCard}
            unavailable={cardsUnavailable}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
            <p className="min-w-0 flex-1">
              Your card choice is saved in this browser only. We never ask for card numbers.
            </p>
            {selected.length ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-3"
                onClick={() => forgetSavedCards()}
              >
                Forget
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto_1fr]">
          <AirportCombobox
            label="Airport"
            placeholder="City, airport or code"
            display={airport ? airportLabel(airport, airports.data) : ""}
            onSelect={(a) => changeAirport(a.iata)}
            onTextChange={onAirportText}
          />
          <label className="block text-sm font-medium">
            Travel date
            <input
              type="date"
              value={on}
              onChange={(e) => {
                setOn(e.target.value);
                syncUrl({ on: e.target.value });
              }}
              aria-describedby={`${formId}-date-help`}
              className={`${inputClass} mt-1`}
            />
            <span
              id={`${formId}-date-help`}
              className="mt-1 block text-xs font-normal text-muted-foreground"
            >
              Leave empty for today
            </span>
          </label>
          <fieldset className="text-sm">
            <legend className="mb-1 font-medium">Your flight</legend>
            <div className="flex h-10 items-center gap-4">
              {(["domestic", "international"] as const).map((s) => (
                <label key={s} className="flex min-h-10 items-center gap-2 capitalize">
                  <input
                    type="radio"
                    name={`${formId}-scope`}
                    checked={scope === s}
                    onChange={() => {
                      setScope(s);
                      syncUrl({ scope: s });
                    }}
                    className="size-4 accent-primary"
                  />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
          <NumberField
            id={`${formId}-guests`}
            label="Guests with you"
            value={guests}
            onChange={setGuests}
            error={guestsParsed.error}
            help="People travelling with you who also want in. 0 if none."
          />
        </div>

        {selected.length ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Usage so far (optional)</legend>
            <p id={factsHelpId} className="text-xs text-muted-foreground">
              Some benefits allow a set number of visits per quarter or year, or need a minimum
              spend first. Enter what you&apos;ve used and spent in the period your bank counts.
              Leave a box empty if you&apos;re not sure; the answer will then say
              &quot;depends&quot;.
            </p>
            <ul className="grid gap-3 md:grid-cols-2">
              {parsedFacts.map((f) => {
                const name = cards.data?.items.find((c) => c.slug === f.slug)?.name ?? f.slug;
                const value = facts[f.slug] ?? { visits: "", spend: "" };
                const set = (patch: Partial<CardFacts>) =>
                  setFacts((all) => ({ ...all, [f.slug]: { ...value, ...patch } }));
                return (
                  <li key={f.slug} className="rounded-lg border p-3">
                    <p className="mb-2 text-sm font-medium">{name}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <NumberField
                        id={`${formId}-${f.slug}-visits`}
                        label="Visits used this period"
                        srSuffix={` with ${name}`}
                        value={value.visits}
                        onChange={(v) => set({ visits: v })}
                        error={f.visits.error}
                        describedBy={factsHelpId}
                        small
                      />
                      <NumberField
                        id={`${formId}-${f.slug}-spend`}
                        label="Spend so far (₹)"
                        srSuffix={` on ${name}`}
                        value={value.spend}
                        onChange={(v) => set({ spend: v })}
                        error={f.spend.error}
                        describedBy={factsHelpId}
                        small
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            size="lg"
            className="h-11 min-w-28 px-5"
            disabled={!!blocker || check.isPending}
            aria-describedby={blocker ? blockerId : undefined}
          >
            {check.isPending ? "Checking…" : "Check"}
          </Button>
          {blocker ? (
            <p id={blockerId} className="text-sm text-muted-foreground">
              {blocker}
            </p>
          ) : null}
        </div>
        {check.isPending && waking ? <WakingMessage /> : null}
      </form>

      {check.isError ? (
        <ErrorState
          title="Couldn't run the check"
          description="The data service didn't respond. It may still be starting up."
          onRetry={() => {
            if (lastRequest.current) run(lastRequest.current);
          }}
        />
      ) : null}
      {answer ? (
        <CheckerResults
          data={answer.data}
          submittedAirport={answer.airport}
          airportName={airportLabel(answer.airport, airports.data)}
          stale={stale || check.isPending}
          headingRef={resultsRef}
          showAllChecks={selected.length <= 1}
        />
      ) : null}
    </div>
  );
}

function NumberField({
  id,
  label,
  srSuffix,
  value,
  onChange,
  error,
  help,
  describedBy,
  small,
}: {
  id: string;
  label: string;
  srSuffix?: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  help?: string;
  describedBy?: string;
  small?: boolean;
}) {
  const ids = [describedBy, help ? `${id}-help` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <label
        htmlFor={id}
        className={small ? "block text-xs text-muted-foreground" : "block text-sm font-medium"}
      >
        {label}
        {srSuffix ? <span className="sr-only">{srSuffix}</span> : null}
      </label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids || undefined}
        placeholder={small ? "Not sure" : undefined}
        className={`${inputClass} mt-1`}
      />
      {help ? (
        <span id={`${id}-help`} className="mt-1 block text-xs text-muted-foreground">
          {help}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className="mt-1 block text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
