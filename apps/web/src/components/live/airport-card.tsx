"use client";

import { BookOpen, Sofa, X } from "lucide-react";
import Link from "next/link";

import { useLounges } from "@/components/lounges/use-lounges";
import { Button } from "@/components/ui/button";
import type { MapAirport } from "@/lib/airports";

/** Small card for an airport picked on the map or in the search. */
export function AirportCard({ airport: a, onClose }: { airport: MapAirport; onClose: () => void }) {
  // Fetched when the card opens; the button appears only when we list lounges here.
  const lounges = useLounges(a.iata);
  const count = lounges.data?.items.length ?? 0;
  return (
    <section
      aria-label={`Airport ${a.iata}`}
      className="rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm text-primary">
            {a.iata}
            {a.icao ? <span className="text-muted-foreground"> · {a.icao}</span> : null}
          </p>
          <h2 className="leading-snug font-semibold">{a.name}</h2>
          {a.city ? <p className="text-sm text-muted-foreground">{a.city}</p> : null}
        </div>
        <Button variant="ghost" size="icon" aria-label="Close airport" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button asChild size="sm" className="h-9 flex-1">
          <Link href={`/airports/${a.iata}`}>
            <BookOpen aria-hidden="true" /> Airport guide
          </Link>
        </Button>
        {count > 0 ? (
          <Button asChild size="sm" variant="outline" className="h-9 flex-1">
            <Link href={`/lounges?airport=${a.iata}`}>
              <Sofa aria-hidden="true" /> Lounges here ({count})
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Location: OurAirports (public domain)
      </p>
    </section>
  );
}
