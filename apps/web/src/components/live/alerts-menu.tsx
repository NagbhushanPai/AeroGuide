"use client";

import { Bell, BellRing, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { describe, type WatchEvent, type WatchedFlight } from "./watchlist";

type Props = {
  watched: WatchedFlight[];
  permission: NotificationPermission | "unsupported";
  onRequestPermission: () => void;
  onUnwatch: (icao24: string, label: string) => void;
  onFocus: (icao24: string) => void;
};

export function AlertsMenu({
  watched,
  permission,
  onRequestPermission,
  onUnwatch,
  onFocus,
}: Props) {
  const Icon = watched.length ? BellRing : Bell;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="bg-background/90 backdrop-blur">
          <Icon aria-hidden="true" />
          Alerts
          {watched.length ? (
            <span className="font-mono tabular-nums">({watched.length})</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Watched flights</DropdownMenuLabel>
        {watched.length === 0 ? (
          <p className="px-2 pb-2 text-xs text-muted-foreground">
            Star a flight to be told when it takes off, lands or drops out of coverage while this
            tab is open. Your list stays in this browser.
          </p>
        ) : (
          watched.map((f) => (
            <DropdownMenuItem
              key={f.icao24}
              onSelect={() => onFocus(f.icao24)}
              className="justify-between"
            >
              <span className="font-mono">{f.label}</span>
              <button
                type="button"
                aria-label={`Stop watching ${f.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onUnwatch(f.icao24, f.label);
                }}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        {permission === "granted" ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Browser notifications are on.</p>
        ) : permission === "unsupported" ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            This browser doesn&apos;t support notifications. Alerts show on the page instead.
          </p>
        ) : permission === "denied" ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Notifications are blocked for this site. Alerts show on the page instead.
          </p>
        ) : (
          <DropdownMenuItem onSelect={onRequestPermission}>
            Turn on browser notifications
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** On-page alert list, announced politely to screen readers. */
export function EventToasts({
  events,
  onDismiss,
}: {
  events: WatchEvent[];
  onDismiss: (e: WatchEvent) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-10 left-3 z-20 flex w-72 flex-col gap-2"
    >
      {events.slice(0, 3).map((e) => (
        <div
          key={`${e.icao24}-${e.kind}-${e.at}`}
          className="pointer-events-auto flex items-start justify-between gap-2 rounded-lg border bg-background/95 p-3 text-sm shadow-lg"
        >
          <span>{describe(e)}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismiss(e)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
