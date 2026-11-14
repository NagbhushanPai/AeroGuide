"use client";

import { Bell, BellRing, Crosshair, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
          <span className="max-sm:sr-only">Alerts</span>
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
            // Two items rather than a button nested in an item: each is reachable with the
            // arrow keys and announced on its own.
            <DropdownMenuGroup key={f.icao24} aria-label={f.label}>
              <DropdownMenuItem onSelect={() => onFocus(f.icao24)}>
                <Crosshair aria-hidden="true" />
                <span className="font-mono">{f.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">Show on map</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onUnwatch(f.icao24, f.label)}
                className="pl-7 text-xs text-muted-foreground"
              >
                <X aria-hidden="true" />
                Stop watching {f.label}
              </DropdownMenuItem>
            </DropdownMenuGroup>
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
    // Top-left, under the map's top bar: the selected flight or airport card takes the bottom
    // of the screen on mobile and the right side on desktop, so toasts never cover it.
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-3 top-28 z-20 flex flex-col gap-2 sm:right-auto sm:w-72 xl:top-16"
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
