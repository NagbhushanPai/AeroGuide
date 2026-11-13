"use client";

import { BookOpen, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { MapAirport } from "@/lib/airports";

/** Small card for an airport picked on the map or in the search. */
export function AirportCard({ airport: a, onClose }: { airport: MapAirport; onClose: () => void }) {
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
      <Button asChild size="sm" className="mt-3 w-full">
        <Link href={`/airports/${a.iata}`}>
          <BookOpen aria-hidden="true" /> Airport guide
        </Link>
      </Button>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Location: OurAirports (public domain)
      </p>
    </section>
  );
}
