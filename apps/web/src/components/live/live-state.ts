import type { PositionsMeta } from "@/lib/api/client";
import { ageSeconds, liveFreshness } from "@/lib/freshness";

/**
 * What the live-status label says. Driven by how old the data is and whether the last refresh
 * failed, not only by the mode the API reports: a "live" response from ten minutes ago is not
 * live any more.
 */
export type LiveState =
  | { kind: "loading" }
  | { kind: "waking" }
  | { kind: "unreachable" }
  | { kind: "demo" }
  | { kind: "unavailable"; message: string | null }
  | { kind: "live"; ageS: number | null }
  | { kind: "delayed"; ageS: number | null }
  | { kind: "expired"; ageS: number };

export function liveState(input: {
  meta: PositionsMeta | undefined;
  /** Current time in ms, or null before the client clock is known (server render). */
  now: number | null;
  /** The latest request failed (the data shown, if any, is from an earlier poll). */
  error: boolean;
  waking: boolean;
}): LiveState {
  const { meta, now, error, waking } = input;
  if (!meta) {
    if (error) return { kind: "unreachable" };
    return waking ? { kind: "waking" } : { kind: "loading" };
  }
  if (meta.mode === "demo") return { kind: "demo" };
  if (meta.mode === "unavailable") return { kind: "unavailable", message: meta.message ?? null };

  let age: number | null = null;
  if (meta.fetched_at && now !== null) {
    try {
      age = ageSeconds(meta.fetched_at, new Date(now));
    } catch {
      age = null;
    }
  }
  const freshness = age === null ? null : liveFreshness(age);
  if (freshness === "expired") return { kind: "expired", ageS: age! };
  if (freshness === "stale" || error || meta.mode === "degraded")
    return { kind: "delayed", ageS: age };
  return { kind: "live", ageS: age };
}
