/**
 * Server-side reads for metadata, JSON-LD, the sitemap and first-paint content. Plain fetch,
 * cached with `use cache` so each record is fetched once per few hours, not per visitor.
 *
 * The free-tier API can be asleep (up to a minute to wake). Every request has a time limit so
 * a page never hangs on it: callers catch `ServerApiError` and fall back to generic metadata
 * and client-side loading. Failures are cached for about a minute only, so a page rendered
 * while the API slept is regenerated soon after it wakes.
 */
import { cacheLife } from "next/cache";

import type {
  AirportDetail,
  AirportList,
  AirportSummary,
  CardDetail,
  CardList,
  CardSummary,
  LoungeDetail,
  LoungeList,
  LoungeSummary,
} from "./client";

const API_BASE = (
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000"
).replace(/\/$/, "");

/** Detail pages and metadata: short, so a sleeping API can't hold up a page for long. */
export const DETAIL_TIMEOUT_MS = 8_000;
/**
 * Lists for the sitemap and build-time params: long enough to wake the API, inside Next's
 * 50 s limit for filling a cache during a build.
 */
export const LIST_TIMEOUT_MS = 40_000;

export class ServerApiError extends Error {
  constructor(
    readonly path: string,
    /** HTTP status, or null for a timeout or network failure. */
    readonly status: number | null,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "ServerApiError";
  }
}

type Outcome =
  | { kind: "ok"; data: unknown }
  | { kind: "missing" }
  | { kind: "failed"; status: number | null; message: string };

/**
 * The one cached request. It never throws, so failures can be cached too, briefly: an error
 * thrown from a cached function isn't stored, and a page rendered around it would otherwise
 * keep its fallback until the next deploy.
 */
async function cachedGet(path: string, timeoutMs: number): Promise<Outcome> {
  "use cache";
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) {
      cacheLife("hours");
      return { kind: "missing" };
    }
    if (!res.ok) {
      cacheLife("minutes");
      return { kind: "failed", status: res.status, message: `${res.status} ${res.statusText}` };
    }
    const data: unknown = await res.json();
    cacheLife("hours"); // content changes when the seed runs, a few times a week at most
    return { kind: "ok", data };
  } catch (err) {
    cacheLife("minutes");
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      kind: "failed",
      status: null,
      message: timedOut ? `timed out after ${timeoutMs} ms` : String(err),
    };
  }
}

/** The record, or null on 404. Throws ServerApiError on any other failure. */
async function getOrNull<T>(path: string, timeoutMs = DETAIL_TIMEOUT_MS): Promise<T | null> {
  const out = await cachedGet(path, timeoutMs);
  if (out.kind === "ok") return out.data as T;
  if (out.kind === "missing") return null;
  throw new ServerApiError(path, out.status, out.message);
}

async function getOrThrow<T>(path: string, timeoutMs: number): Promise<T> {
  const data = await getOrNull<T>(path, timeoutMs);
  if (data === null) throw new ServerApiError(path, 404, "not found");
  return data;
}

export function getAirport(code: string): Promise<AirportDetail | null> {
  return getOrNull(`/api/v1/airports/${encodeURIComponent(code)}`);
}

export function getLounge(slug: string): Promise<LoungeDetail | null> {
  return getOrNull(`/api/v1/lounges/${encodeURIComponent(slug)}`);
}

export function getCard(slug: string): Promise<CardDetail | null> {
  return getOrNull(`/api/v1/cards/${encodeURIComponent(slug)}`);
}

/** Every airport (about 120; the API serves up to 200 per page). */
export async function getAllAirports(timeoutMs = LIST_TIMEOUT_MS): Promise<AirportSummary[]> {
  const items: AirportSummary[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await getOrThrow<AirportList>(
      `/api/v1/airports?limit=200&offset=${offset}`,
      timeoutMs,
    );
    items.push(...page.items);
    if (page.items.length === 0 || items.length >= page.total) return items;
  }
}

export async function getAllLounges(timeoutMs = LIST_TIMEOUT_MS): Promise<LoungeSummary[]> {
  return (await getOrThrow<LoungeList>("/api/v1/lounges", timeoutMs)).items;
}

export async function getAllCards(timeoutMs = LIST_TIMEOUT_MS): Promise<CardSummary[]> {
  return (await getOrThrow<CardList>("/api/v1/cards", timeoutMs)).items;
}

/**
 * Wraps a server read for metadata and first paint: the value, null for a 404, or
 * "unavailable" when the API didn't answer in time (callers fall back to generic output).
 */
export async function settle<T>(read: Promise<T | null>): Promise<T | null | "unavailable"> {
  try {
    return await read;
  } catch (err) {
    if (err instanceof ServerApiError) {
      console.warn(`[server api] ${err.message}; falling back to client loading`);
      return "unavailable";
    }
    throw err;
  }
}
