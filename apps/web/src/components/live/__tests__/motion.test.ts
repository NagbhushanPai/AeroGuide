import { describe, expect, it } from "vitest";

import type { AircraftFeature } from "@/lib/api/client";

import { MAX_ESTIMATE_S, estimateSeconds, moveAircraft, project } from "../motion";

const T0 = Date.parse("2026-11-15T06:00:00Z");

function plane(props: Partial<AircraftFeature["properties"]> = {}): AircraftFeature {
  return {
    type: "Feature",
    id: "800abc",
    geometry: { type: "Point", coordinates: [77.0, 28.0] },
    properties: {
      icao24: "800abc",
      on_ground: false,
      gs_kt: 450,
      track_deg: 90,
      position_time: new Date(T0).toISOString(),
      ...props,
    },
  } as AircraftFeature;
}

describe("dead reckoning", () => {
  it("projects along a bearing over a great circle", () => {
    const [lon, lat] = project(77, 0, 90, 111.195); // one degree east along the equator
    expect(lon).toBeCloseTo(78, 3);
    expect(lat).toBeCloseTo(0, 6);
    const [, north] = project(77, 28, 0, 111.195);
    expect(north).toBeCloseTo(29, 3);
  });

  it("moves an airborne aircraft by speed x time since its report", () => {
    const [moved] = moveAircraft([plane()], T0 + 60_000);
    const [lon, lat] = moved.geometry.coordinates as [number, number];
    // 450 kt for 60 s is 13.89 km, about 0.1415 degrees of longitude at 28 N.
    expect(lon - 77).toBeCloseTo(0.1415, 3);
    expect(lat).toBeCloseTo(28, 3);
  });

  it("caps the estimate and never moves backwards", () => {
    expect(estimateSeconds(plane(), T0 + 10 * 60_000)).toBe(MAX_ESTIMATE_S);
    expect(estimateSeconds(plane(), T0 - 5_000)).toBe(0);
  });

  it("leaves aircraft on the ground, slow, or without speed or track where they are", () => {
    for (const p of [
      plane({ on_ground: true }),
      plane({ gs_kt: 20 }),
      plane({ gs_kt: null }),
      plane({ track_deg: null }),
      plane({ position_time: "not a time" }),
    ]) {
      expect(moveAircraft([p], T0 + 30_000)[0]).toBe(p);
    }
  });
});
