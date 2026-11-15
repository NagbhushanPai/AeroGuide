import type { AircraftFeature } from "@/lib/api/client";

/**
 * Dead reckoning between live updates: an airborne aircraft is drawn where its reported ground
 * speed and track would have taken it since its last position report. These in-between
 * positions are estimates (the map legend says so). They never run more than
 * MAX_ESTIMATE_S past the last report, and the next update replaces them with real positions.
 */

/** The API sweeps about once a minute; a little more covers a slow sweep. */
export const MAX_ESTIMATE_S = 75;
/** Below this the speed is likely taxiing or noise: don't move it. */
const MIN_SPEED_KT = 40;
const EARTH_KM = 6371;
const KT_TO_KMH = 1.852;

/** Destination point from a start, an initial bearing and a distance (great circle). */
export function project(
  lon: number,
  lat: number,
  bearingDeg: number,
  distanceKm: number,
): [number, number] {
  const d = distanceKm / EARTH_KM;
  const b = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 =
    l1 +
    Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [(((l2 * 180) / Math.PI + 540) % 360) - 180, (p2 * 180) / Math.PI];
}

/** Seconds of estimated movement for one aircraft at `nowMs`, or 0 when it shouldn't move. */
export function estimateSeconds(f: AircraftFeature, nowMs: number): number {
  const p = f.properties;
  if (p.on_ground || p.gs_kt == null || p.track_deg == null || p.gs_kt < MIN_SPEED_KT) return 0;
  const reported = Date.parse(p.position_time);
  if (Number.isNaN(reported)) return 0;
  return Math.min(Math.max((nowMs - reported) / 1000, 0), MAX_ESTIMATE_S);
}

/** The features with airborne aircraft moved to their estimated position at `nowMs`. */
export function moveAircraft(
  features: readonly AircraftFeature[],
  nowMs: number,
): AircraftFeature[] {
  return features.map((f) => {
    const s = estimateSeconds(f, nowMs);
    if (s === 0) return f;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const km = (f.properties.gs_kt! * KT_TO_KMH * s) / 3600;
    return {
      ...f,
      geometry: { ...f.geometry, coordinates: project(lon, lat, f.properties.track_deg!, km) },
    };
  });
}
