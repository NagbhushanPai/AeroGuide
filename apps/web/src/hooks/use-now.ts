"use client";

import { useSyncExternalStore } from "react";

/*
 * One shared clock for every "x min ago" label on the page. During server rendering and
 * hydration it returns null, so markup is deterministic (components show an absolute time),
 * then it ticks on the client.
 */

const TICK_MS = 15_000;
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => null;

/** Current time in ms on the client, or null while server-rendering/hydrating. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
