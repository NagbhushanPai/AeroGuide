"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AircraftFeature, LiveMode } from "@/lib/api/client";

import {
  describe,
  detectEvent,
  loadWatchlist,
  saveWatchlist,
  type Observed,
  type WatchEvent,
  type WatchedFlight,
} from "./watchlist";

type Permission = NotificationPermission | "unsupported";

export function useWatchlist(features: AircraftFeature[] | undefined, mode: LiveMode | undefined) {
  const [watched, setWatched] = useState<WatchedFlight[]>([]);
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [permission, setPermission] = useState<Permission>("default");
  const previous = useRef<Map<string, Observed>>(new Map());

  // Load from storage after mount (storage is client-only).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setWatched(loadWatchlist());
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const toggle = useCallback((icao24: string, label: string) => {
    setWatched((list) => {
      const next = list.some((f) => f.icao24 === icao24)
        ? list.filter((f) => f.icao24 !== icao24)
        : [...list, { icao24, label, addedAt: new Date().toISOString() }];
      saveWatchlist(next);
      return next;
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }, []);

  const dismiss = useCallback((event: WatchEvent) => {
    setEvents((list) => list.filter((e) => e !== event));
  }, []);

  // Compare each poll with the last one. Only live data counts: a degraded or unavailable
  // feed would otherwise look like every flight "lost signal".
  useEffect(() => {
    if (!features || mode !== "live" || watched.length === 0) return;
    const at = new Date().toISOString();
    const byId = new Map(features.map((f) => [f.id, f]));
    const fresh: WatchEvent[] = [];
    for (const flight of watched) {
      const f = byId.get(flight.icao24);
      const now: Observed = f ? { onGround: f.properties.on_ground } : null;
      const event = detectEvent(flight, previous.current.get(flight.icao24), now, at);
      previous.current.set(flight.icao24, now);
      if (event) fresh.push(event);
    }
    if (fresh.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- events derive from polled data
    setEvents((list) => [...fresh, ...list].slice(0, 20));
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const e of fresh)
        new Notification("AeroGuide", { body: describe(e), tag: `${e.icao24}-${e.kind}` });
    }
  }, [features, mode, watched]);

  const isWatched = useCallback(
    (icao24: string) => watched.some((f) => f.icao24 === icao24),
    [watched],
  );

  return { watched, events, permission, toggle, isWatched, requestPermission, dismiss };
}
