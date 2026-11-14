/**
 * Small helpers for keeping filters in the URL. Updates use the native History API, which
 * Next.js syncs with useSearchParams without a server round trip. Other keys are left alone so
 * two components on one page (the checker and the card directory) don't clobber each other.
 */

export type ParamUpdates = Record<string, string | null | undefined>;

/** A new query string: `current` with `updates` applied (null/empty removes a key). */
export function withParams(current: string, updates: ParamUpdates): string {
  const sp = new URLSearchParams(current);
  for (const [key, value] of Object.entries(updates)) {
    if (value) sp.set(key, value);
    else sp.delete(key);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/** Replaces the current history entry's query string. No-op outside the browser. */
export function replaceParams(updates: ParamUpdates): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  const next = withParams(search, updates);
  if (next === search || (next === "" && search === "?")) return;
  window.history.replaceState(null, "", `${pathname}${next}${hash}`);
}
