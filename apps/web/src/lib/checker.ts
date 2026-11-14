/** Pure helpers for the lounge checker: input parsing, URL state and per-lounge results. */

import type {
  CardSummary,
  EligibilityResponse,
  EligibilityStatus,
  LoungeResult,
  LoungeSummary,
} from "@/lib/api/client";

export type Scope = "domestic" | "international";

export type Parsed = { value: number | null; error: string | null };

/**
 * A whole, non-negative number typed by a person. Commas, spaces and ₹ are allowed ("60,000");
 * empty means "not given". Anything else is an error, never silently 0.
 */
export function parseWholeNumber(raw: string, example = "2"): Parsed {
  const text = raw.replace(/[,\s₹]/g, "");
  if (text === "") return { value: null, error: null };
  if (!/^\d+$/.test(text)) return { value: null, error: `Enter a whole number, like ${example}.` };
  const n = Number(text);
  if (!Number.isSafeInteger(n)) return { value: null, error: "That number is too large." };
  return { value: n, error: null };
}

export type CheckerParams = { airport: string; on: string; scope: Scope };

/** Airport, date and scope from the URL. Invalid values are dropped, not guessed. */
export function readCheckerParams(params: { get(key: string): string | null }): CheckerParams {
  const airport = (params.get("airport") ?? "").trim().toUpperCase();
  const on = params.get("on") ?? "";
  return {
    airport: /^[A-Z]{3}$/.test(airport) ? airport : "",
    on: /^\d{4}-\d{2}-\d{2}$/.test(on) && !Number.isNaN(Date.parse(on)) ? on : "",
    scope: params.get("scope") === "international" ? "international" : "domestic",
  };
}

/** URL updates for the checker. Cards are never put in the URL; ?card= is consumed. */
export function checkerParamUpdates(p: CheckerParams): Record<string, string | null> {
  return {
    airport: p.airport || null,
    on: p.on || null,
    scope: p.scope === "international" ? "international" : p.airport ? "domestic" : null,
    card: null,
  };
}

/** "2026-11-20" -> "20 Nov 2026" (the date as written, no time-zone shift). */
export function formatTravelDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export type CardVerdict = { card: CardSummary; result: LoungeResult };
export type LoungeRow = { lounge: LoungeSummary; best: EligibilityStatus; verdicts: CardVerdict[] };

const RANK: Record<EligibilityStatus, number> = { yes: 0, depends: 1, no: 2 };

/** Turns per-card results into one row per lounge: any yes first, then depends, then no. */
export function resultsByLounge(data: EligibilityResponse): LoungeRow[] {
  const rows = new Map<string, LoungeRow>();
  for (const r of data.results) {
    for (const l of r.lounges) {
      const row = rows.get(l.lounge.slug);
      const verdict = { card: r.card, result: l };
      if (!row) {
        rows.set(l.lounge.slug, { lounge: l.lounge, best: l.status, verdicts: [verdict] });
      } else {
        row.verdicts.push(verdict);
        if (RANK[l.status] < RANK[row.best]) row.best = l.status;
      }
    }
  }
  for (const row of rows.values()) {
    row.verdicts.sort((a, b) => RANK[a.result.status] - RANK[b.result.status]);
  }
  return [...rows.values()].sort(
    (a, b) =>
      RANK[a.best] - RANK[b.best] ||
      (a.lounge.terminal ?? "").localeCompare(b.lounge.terminal ?? "") ||
      a.lounge.name.localeCompare(b.lounge.name),
  );
}
