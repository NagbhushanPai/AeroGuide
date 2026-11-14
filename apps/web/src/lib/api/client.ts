import type { components } from "./schema";

export type PositionsResponse = components["schemas"]["PositionsResponse"];
export type AircraftFeature = components["schemas"]["AircraftFeature"];
export type AircraftProperties = components["schemas"]["AircraftProperties"];
export type AircraftDetail = components["schemas"]["AircraftDetail"];
export type ReportedRoute = components["schemas"]["ReportedRoute"];
export type PositionsMeta = components["schemas"]["PositionsMeta"];
export type LiveMode = PositionsMeta["mode"];
export type AirportList = components["schemas"]["AirportList"];
export type AirportSummary = components["schemas"]["AirportSummary"];
export type AirportDetail = components["schemas"]["AirportDetail"];
export type Provenance = components["schemas"]["Provenance"];
export type SourceRef = components["schemas"]["SourceRef"];
export type TerminalOut = components["schemas"]["TerminalOut"];
export type MappedTerminals = components["schemas"]["MappedTerminals"];
export type AirlinesSeen = components["schemas"]["AirlinesSeen"];
export type LoungeSummary = components["schemas"]["LoungeSummary"];
export type LoungeList = components["schemas"]["LoungeList"];
export type LoungeDetail = components["schemas"]["LoungeDetail"];
export type CardSummary = components["schemas"]["CardSummary"];
export type CardList = components["schemas"]["CardList"];
export type CardDetail = components["schemas"]["CardDetail"];
export type PolicyOut = components["schemas"]["PolicyOut"];
export type EligibilityRequest = components["schemas"]["EligibilityRequest"];
export type EligibilityResponse = components["schemas"]["EligibilityResponse"];
export type EligibilityStatus = components["schemas"]["LoungeResult"]["status"];
export type LoungeResult = components["schemas"]["LoungeResult"];
export type CheckOut = components["schemas"]["CheckOut"];
export type CardResult = components["schemas"]["CardResult"];
export type CardAccess = components["schemas"]["CardAccess"];
export type CardLounges = components["schemas"]["CardLounges"];
export type ScopePrograms = components["schemas"]["ScopePrograms"];
export type ProgramBrief = components["schemas"]["ProgramBrief"];
export type BankRef = components["schemas"]["BankRef"];
export type SearchHit = components["schemas"]["SearchHit"];
export type SearchResults = components["schemas"]["SearchResults"];
export type Region = AirportSummary["region"];

export const REGIONS: readonly Region[] = [
  "North",
  "Central",
  "East",
  "West",
  "South",
  "North-East",
];

/** Browser-visible API base URL (not a secret). */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export function fetchPositions(signal?: AbortSignal): Promise<PositionsResponse> {
  return getJson<PositionsResponse>("/api/v1/positions", signal);
}

export type AirportQuery = {
  q?: string;
  region?: Region | null;
  guidesOnly?: boolean;
  limit?: number;
  offset?: number;
};

export function fetchAirports(query: AirportQuery, signal?: AbortSignal): Promise<AirportList> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.region) params.set("region", query.region);
  if (query.guidesOnly) params.set("guides_only", "true");
  params.set("limit", String(query.limit ?? 60));
  if (query.offset) params.set("offset", String(query.offset));
  return getJson<AirportList>(`/api/v1/airports?${params}`, signal);
}

/** Resolves to null for an unknown code (404). */
export async function fetchAirport(
  code: string,
  signal?: AbortSignal,
): Promise<AirportDetail | null> {
  try {
    return await getJson<AirportDetail>(`/api/v1/airports/${encodeURIComponent(code)}`, signal);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Airlines seen near the airport in the last `days` days. Null for an unknown code. */
export async function fetchAirlinesSeen(
  code: string,
  days = 7,
  signal?: AbortSignal,
): Promise<AirlinesSeen | null> {
  try {
    return await getJson<AirlinesSeen>(
      `/api/v1/airports/${encodeURIComponent(code)}/airlines-seen?days=${days}`,
      signal,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

async function nullOn404<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function fetchLounges(airport?: string, signal?: AbortSignal): Promise<LoungeList> {
  const qs = airport ? `?airport=${encodeURIComponent(airport)}` : "";
  return getJson<LoungeList>(`/api/v1/lounges${qs}`, signal);
}

export function fetchLounge(slug: string, signal?: AbortSignal): Promise<LoungeDetail | null> {
  return nullOn404(getJson<LoungeDetail>(`/api/v1/lounges/${encodeURIComponent(slug)}`, signal));
}

export function fetchCards(signal?: AbortSignal): Promise<CardList> {
  return getJson<CardList>("/api/v1/cards", signal);
}

export function fetchCard(slug: string, signal?: AbortSignal): Promise<CardDetail | null> {
  return nullOn404(getJson<CardDetail>(`/api/v1/cards/${encodeURIComponent(slug)}`, signal));
}

/** Departure lounges the card's programmes open (conditions still apply). Null for an unknown card. */
export function fetchCardLounges(slug: string, signal?: AbortSignal): Promise<CardLounges | null> {
  return nullOn404(
    getJson<CardLounges>(`/api/v1/cards/${encodeURIComponent(slug)}/lounges`, signal),
  );
}

/** Airports, lounges and cards matching every word of `q`. */
export function searchSite(q: string, limit = 12, signal?: AbortSignal): Promise<SearchResults> {
  const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  return getJson<SearchResults>(`/api/v1/search?${params}`, signal);
}

/** Nothing in the request is stored by the API. Null for an unknown airport. */
export async function checkEligibility(
  body: EligibilityRequest,
  signal?: AbortSignal,
): Promise<EligibilityResponse | null> {
  const res = await fetch(`${API_BASE_URL}/api/v1/eligibility`, {
    method: "POST",
    signal,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return (await res.json()) as EligibilityResponse;
}

/** Resolves to null when the aircraft is no longer tracked (404). */
export async function fetchAircraft(
  icao24: string,
  signal?: AbortSignal,
): Promise<AircraftDetail | null> {
  try {
    return await getJson<AircraftDetail>(`/api/v1/positions/${encodeURIComponent(icao24)}`, signal);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
