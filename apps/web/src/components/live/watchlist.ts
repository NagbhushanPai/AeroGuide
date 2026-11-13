/**
 * Watched flights and the events we can honestly detect from ADS-B alone:
 * take-off and landing (on_ground transitions), and signal lost / regained.
 * There is no schedule data, so there are no delay or gate alerts.
 */

export type WatchedFlight = { icao24: string; label: string; addedAt: string };

export type WatchEvent = {
  icao24: string;
  label: string;
  kind: "took_off" | "landed" | "signal_lost" | "signal_back";
  at: string;
};

export type Observed = { onGround: boolean } | null; // null = not in the latest data

export const STORAGE_KEY = "aeroguide.watchlist.v1";

const MESSAGES: Record<WatchEvent["kind"], string> = {
  took_off: "took off",
  landed: "landed",
  signal_lost: "is no longer being tracked",
  signal_back: "is being tracked again",
};

export function describe(event: WatchEvent): string {
  return `${event.label} ${MESSAGES[event.kind]}`;
}

/** Compare the previous and current observation of one watched aircraft. */
export function detectEvent(
  flight: WatchedFlight,
  before: Observed | undefined,
  now: Observed,
  at: string,
): WatchEvent | null {
  if (before === undefined) return null; // first observation after load: nothing to compare
  const base = { icao24: flight.icao24, label: flight.label, at };
  if (before === null && now !== null) return { ...base, kind: "signal_back" };
  if (before !== null && now === null) return { ...base, kind: "signal_lost" };
  if (before !== null && now !== null && before.onGround !== now.onGround) {
    return { ...base, kind: now.onGround ? "landed" : "took_off" };
  }
  return null;
}

export function loadWatchlist(): WatchedFlight[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (f): f is WatchedFlight => typeof f?.icao24 === "string" && typeof f?.label === "string",
        )
      : [];
  } catch {
    return []; // storage blocked or corrupt: start empty
  }
}

export function saveWatchlist(list: WatchedFlight[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode): the watch list lasts for this visit only */
  }
}
