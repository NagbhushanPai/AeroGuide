"use client";

import { ChevronUp, Palette } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import { ALTITUDE_STOPS, GROUND_COLOR } from "./altitude";

const gradient = `linear-gradient(to right, ${ALTITUDE_STOPS.map(
  (s, i) => `${s.color} ${(i / (ALTITUDE_STOPS.length - 1)) * 100}%`,
).join(", ")})`;

/** Collapsible key for the aircraft colour ramp. Collapsed by default to keep the map clear. */
export function AltitudeLegend({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div
      className={cn(
        "rounded-lg border bg-background/90 text-xs shadow-sm backdrop-blur",
        open ? "w-56 p-2.5" : "w-auto",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          open ? "" : "h-7 px-2",
        )}
      >
        <Palette aria-hidden="true" className="size-3.5 text-muted-foreground" />
        Altitude colours
        <ChevronUp
          aria-hidden="true"
          className={cn("ml-auto size-3.5 transition-transform", !open && "rotate-180")}
        />
      </button>
      <div id={panelId} hidden={!open} className="mt-2 space-y-2">
        <p className="sr-only">
          Aircraft are coloured by altitude: amber near the ground, yellow at 10,000 ft, green at
          20,000 ft, blue at 30,000 ft and violet at 40,000 ft and above.
        </p>
        <div aria-hidden="true" className="h-2 rounded-full" style={{ background: gradient }} />
        <ul className="flex justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
          {ALTITUDE_STOPS.map((s) => (
            <li key={s.ft}>{s.ft === 0 ? "0" : `${s.ft / 1000}k`}</li>
          ))}
        </ul>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ background: GROUND_COLOR }}
          />
          On the ground · altitudes in feet
        </p>
      </div>
    </div>
  );
}
