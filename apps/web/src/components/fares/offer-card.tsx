"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Info, Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { WakingMessage } from "@/components/data/waking-message";
import { Button } from "@/components/ui/button";
import { useWaking } from "@/hooks/use-waking";
import { ApiError, fetchBookingLinks, type Leg, type Offer } from "@/lib/api/client";
import {
  fareErrorMessage,
  formatDuration,
  formatFareDate,
  formatPrice,
  legTimes,
  stopsLabel,
} from "@/lib/fares";

/** Unique values, in order. */
const unique = (xs: readonly string[]) => [...new Set(xs.filter(Boolean))];

export function offerAirlines(offer: Offer): string {
  const names = unique([...offer.outbound.carrier_names, ...(offer.inbound?.carrier_names ?? [])]);
  return names.length ? names.join(" + ") : "Airline not stated";
}

export function OfferCard({
  offer,
  passengers,
  onSearchAgain,
}: {
  offer: Offer;
  passengers: number;
  onSearchAgain: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const headingId = `${id}-airlines`;
  const panelId = `${id}-sellers`;

  return (
    <article aria-labelledby={headingId} className="rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <h3 id={headingId} className="font-medium">
            {offerAirlines(offer)}
          </h3>
          <LegRow leg={offer.outbound} label={offer.inbound ? "Outbound" : null} />
          {offer.inbound ? <LegRow leg={offer.inbound} label="Return" /> : null}
        </div>
        <div className="flex items-end justify-between gap-3 border-t pt-3 sm:w-44 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0 sm:text-right">
          <div>
            <p className="text-xl font-semibold tabular-nums">
              {formatPrice(offer.price, offer.currency)}
            </p>
            {passengers > 1 ? (
              <p className="text-xs text-muted-foreground">for {passengers} passengers</p>
            ) : null}
            {!offer.price_verified ? (
              <p className="mt-1 flex max-w-40 items-start gap-1 text-xs text-warning sm:ml-auto">
                <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                {/* Visible text, not a tooltip, so touch and keyboard users see it too. */}
                <span>Unconfirmed price: the seller shows the final one</span>
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            size="lg"
            className="h-10 min-w-24 px-4"
            aria-expanded={open}
            aria-controls={panelId}
            aria-describedby={headingId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Hide sellers" : "Book"}
          </Button>
        </div>
      </div>
      <div id={panelId} hidden={!open}>
        {open ? <Sellers offer={offer} onSearchAgain={onSearchAgain} /> : null}
      </div>
    </article>
  );
}

function LegRow({ leg, label }: { leg: Leg; label: string | null }) {
  const t = legTimes(leg);
  const flights = unique(leg.flight_numbers);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {label ? (
          <span className="font-medium text-foreground">
            {label} · {formatFareDate(leg.departure_local)}
            {flights.length ? " · " : ""}
          </span>
        ) : null}
        {flights.length ? (
          <span className="font-mono">
            <span className="sr-only">Flight </span>
            {flights.join(", ")}
          </span>
        ) : null}
      </p>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <p>
          <span className="sr-only">Departs </span>
          <time className="block text-lg font-semibold tabular-nums">{t.departs}</time>
          <span className="block font-mono text-xs text-muted-foreground">{leg.origin}</span>
        </p>
        <div className="text-center text-xs text-muted-foreground">
          <p>{formatDuration(leg.duration_minutes)}</p>
          <div aria-hidden="true" className="my-1 h-px bg-border" />
          <p className={leg.stops > 0 ? "text-foreground" : undefined}>{stopsLabel(leg)}</p>
        </div>
        <p className="text-right">
          <span className="sr-only">Arrives </span>
          <span className="block text-lg font-semibold tabular-nums">
            <time>{t.arrives}</time>
            {t.plusDays > 0 ? (
              <sup className="ml-0.5 text-xs font-medium text-warning">
                +{t.plusDays}
                <span className="sr-only">
                  {t.plusDays === 1 ? " (next day)" : ` (${t.plusDays} days later)`}
                </span>
              </sup>
            ) : null}
          </span>
          <span className="block font-mono text-xs text-muted-foreground">{leg.destination}</span>
        </p>
      </div>
    </div>
  );
}

/** Sellers for one offer, fetched only now: each first request for an offer costs one search. */
function Sellers({ offer, onSearchAgain }: { offer: Offer; onSearchAgain: () => void }) {
  const links = useQuery({
    queryKey: ["fare-booking-links", offer.booking.provider, offer.booking.reference],
    queryFn: ({ signal }) => fetchBookingLinks(offer.booking, signal),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const waking = useWaking(links.isFetching && !links.data);

  if (links.isPending) {
    return (
      <div role="status" className="mt-4 border-t pt-4 text-sm text-muted-foreground">
        {waking ? (
          <WakingMessage />
        ) : (
          <span className="inline-flex items-center gap-2">
            <Loader2
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            Finding sellers…
          </span>
        )}
      </div>
    );
  }

  if (links.isError) {
    const expired = links.error instanceof ApiError && links.error.status === 404;
    return (
      <div role="alert" className="mt-4 space-y-3 border-t pt-4 text-sm">
        <p>{fareErrorMessage(links.error)}</p>
        <Button
          type="button"
          variant="outline"
          className="h-9 px-3"
          onClick={() => (expired ? onSearchAgain() : void links.refetch())}
        >
          {expired ? "Search again" : "Try again"}
        </Button>
      </div>
    );
  }

  const sellers = [...links.data.links].sort(
    (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  );
  if (!sellers.length) {
    return (
      <p role="status" className="mt-4 border-t pt-4 text-sm">
        No seller is offering this fare right now. Search again for current prices.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2 border-t pt-4">
      <p role="status" className="text-sm font-medium">
        {sellers.length === 1 ? "1 place to book" : `${sellers.length} places to book`}, cheapest
        first
      </p>
      <ul className="space-y-2">
        {sellers.map((s, i) => (
          <li key={`${s.seller}-${i}`}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{s.seller}</span>
                {s.fare_name || s.seller_type ? (
                  <span className="block text-xs text-muted-foreground">
                    {[s.fare_name, sellerType(s.seller_type)].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </span>
              {s.price !== null ? (
                <span className="font-semibold tabular-nums">
                  {formatPrice(s.price, s.currency ?? offer.currency)}
                </span>
              ) : null}
              <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        The seller confirms the final price and fare rules before you pay.
      </p>
    </div>
  );
}

function sellerType(type: string | null): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t === "airline") return "Airline";
  if (t === "ota" || t === "agency" || t === "travel_agency") return "Travel agency";
  return t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
