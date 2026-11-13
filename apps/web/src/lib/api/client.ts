import type { components } from "./schema";

export type PositionsResponse = components["schemas"]["PositionsResponse"];
export type AircraftFeature = components["schemas"]["AircraftFeature"];
export type AircraftProperties = components["schemas"]["AircraftProperties"];
export type AircraftDetail = components["schemas"]["AircraftDetail"];
export type ReportedRoute = components["schemas"]["ReportedRoute"];
export type PositionsMeta = components["schemas"]["PositionsMeta"];
export type LiveMode = PositionsMeta["mode"];

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
