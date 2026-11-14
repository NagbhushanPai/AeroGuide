/** Helpers for the header search dialog. */

import type { SearchHit } from "@/lib/api/client";

/** Shortest query sent to the API. */
export const MIN_QUERY = 2;

const ORDER: SearchHit["kind"][] = ["airport", "lounge", "card"];

export type HitGroup = { kind: SearchHit["kind"]; hits: SearchHit[] };

/** Hits grouped as Airports, Lounges, Cards, keeping the API's ranking inside each group. */
export function groupHits(hits: readonly SearchHit[]): HitGroup[] {
  return ORDER.map((kind) => ({ kind, hits: hits.filter((h) => h.kind === kind) })).filter(
    (g) => g.hits.length,
  );
}

/** True when a key press lands in something the person is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = ((el as HTMLInputElement).type || "text").toLowerCase();
  return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file"].includes(
    type,
  );
}
