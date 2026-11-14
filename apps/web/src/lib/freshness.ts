/**
 * Pure helpers for showing how old data is. Thresholds follow
 * docs/architecture/flight-data-flow.md and ADR-0006.
 */

/** Upstream sweeps run once a minute (ADR-0012), so live data is normally 0–70 s old. */
export const LIVE_STALE_AFTER_S = 90;
export const LIVE_EXPIRED_AFTER_S = 5 * 60;

export type Freshness = "fresh" | "stale" | "expired";

/** Seconds between `iso` and `now` (never negative, so clock skew can't make data look newer). */
export function ageSeconds(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) throw new Error(`Invalid timestamp: ${iso}`);
  return Math.max(0, Math.floor((now.getTime() - then) / 1000));
}

export function liveFreshness(age: number): Freshness {
  if (age < LIVE_STALE_AFTER_S) return "fresh";
  if (age < LIVE_EXPIRED_AFTER_S) return "stale";
  return "expired";
}

/** "just now", "45 s ago", "12 min ago", "3 h ago", "2 days ago". */
export function formatAge(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export type VerificationState = "verified" | "unverified" | "outdated" | "unavailable";

/**
 * `outdated` is computed, never stored (ADR-0006): a verified record whose
 * re-verify window has passed.
 */
export function displayVerification(
  status: Exclude<VerificationState, "outdated">,
  verifiedAt: string | null,
  reverifyAfterDays: number,
  today: Date,
): VerificationState {
  if (status !== "verified") return status;
  // A "verified" record without a date breaks ADR-0006; never display it as verified.
  if (verifiedAt === null) return "unverified";
  const due = Date.parse(verifiedAt) + reverifyAfterDays * 86_400_000;
  return today.getTime() > due ? "outdated" : "verified";
}

const IST = "Asia/Kolkata";

/** Absolute time in IST, deterministic for server rendering: "13 Nov 2026, 18:40 IST". */
export function formatIst(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST,
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: IST,
  });
  return `${date}, ${time} IST`;
}

const IST_DAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: IST,
});

/**
 * Today's date in IST as "YYYY-MM-DD", for comparing with API dates (valid_from/valid_to),
 * which are Indian calendar dates. `new Date().toISOString().slice(0, 10)` is the UTC date and
 * is a day behind between 00:00 and 05:30 IST.
 */
export function todayIst(now: Date = new Date()): string {
  return IST_DAY.format(now);
}

/** "14:10 IST". */
export function formatIstTime(iso: string): string {
  const time = new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: IST,
  });
  return `${time} IST`;
}

/**
 * Time in IST with the day when it isn't today: "01:40 IST", "Tomorrow 01:40 IST",
 * "Yesterday 23:10 IST" or "16 Nov, 01:40 IST".
 */
export function formatIstWithDay(iso: string, now: Date): string {
  const time = formatIstTime(iso);
  const day = todayIst(new Date(iso));
  if (day === todayIst(now)) return time;
  if (day === todayIst(new Date(now.getTime() + 86_400_000))) return `Tomorrow ${time}`;
  if (day === todayIst(new Date(now.getTime() - 86_400_000))) return `Yesterday ${time}`;
  const date = new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: IST,
  });
  return `${date}, ${time}`;
}

/** Date only in IST: "13 Nov 2026". */
export function formatIstDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST,
  });
}
