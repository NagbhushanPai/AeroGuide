import { describe, expect, it } from "vitest";

import type { PositionsMeta } from "@/lib/api/client";

import { cleanIdent, displayName, hasCallsign } from "../format";
import { liveState } from "../live-state";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

function meta(extra: Partial<PositionsMeta> = {}): PositionsMeta {
  return {
    mode: "live",
    source: "test feed",
    source_url: null,
    attribution: null,
    fetched_at: ago(20),
    generated_at: ago(0),
    count: 2,
    message: null,
    ...extra,
  };
}

describe("liveState", () => {
  const base = { now: NOW, error: false, waking: false };

  it("is live only when the data is fresh and the last request worked", () => {
    expect(liveState({ ...base, meta: meta() }).kind).toBe("live");
    expect(liveState({ ...base, meta: meta(), error: true }).kind).toBe("delayed");
  });

  it("says delayed when a 'live' response is getting old", () => {
    const s = liveState({ ...base, meta: meta({ fetched_at: ago(180) }) });
    expect(s).toEqual({ kind: "delayed", ageS: 180 });
  });

  it("says no recent data once the data has expired, whatever the mode", () => {
    expect(liveState({ ...base, meta: meta({ fetched_at: ago(600) }) }).kind).toBe("expired");
  });

  it("keeps demo and unavailable states", () => {
    expect(liveState({ ...base, meta: meta({ mode: "demo" }) }).kind).toBe("demo");
    expect(liveState({ ...base, meta: meta({ mode: "unavailable", fetched_at: null }) })).toEqual({
      kind: "unavailable",
      message: null,
    });
  });

  it("treats a degraded feed as delayed", () => {
    expect(liveState({ ...base, meta: meta({ mode: "degraded" }) }).kind).toBe("delayed");
  });

  it("falls back to the mode before the client clock is known", () => {
    expect(liveState({ ...base, now: null, meta: meta() })).toEqual({ kind: "live", ageS: null });
  });

  it("describes the wait for the first response", () => {
    expect(liveState({ ...base, meta: undefined }).kind).toBe("loading");
    expect(liveState({ ...base, meta: undefined, waking: true }).kind).toBe("waking");
    expect(liveState({ ...base, meta: undefined, error: true }).kind).toBe("unreachable");
  });
});

describe("displayName", () => {
  const p = { callsign: null, registration: null, icao24: "8a1b2c" };

  it("ignores junk callsigns and falls back to the registration, then the hex code", () => {
    expect(cleanIdent("@@@@@@@@")).toBeNull();
    expect(cleanIdent("   ")).toBeNull();
    expect(cleanIdent("----")).toBeNull();
    expect(displayName({ ...p, callsign: "@@@@@@@@", registration: "VT-ABC" })).toBe("VT-ABC");
    expect(displayName({ ...p, callsign: "  " })).toBe("8A1B2C");
  });

  it("prefers the flight number, then a clean callsign", () => {
    expect(displayName({ ...p, flight_number: "AI101", callsign: "AIC101" })).toBe("AI101");
    expect(displayName({ ...p, callsign: " ign123 " })).toBe("IGN123");
  });

  it("knows whether an aircraft has a usable callsign", () => {
    expect(hasCallsign({ ...p, callsign: "IGO123" })).toBe(true);
    expect(hasCallsign({ ...p, callsign: "????", registration: "VT-ABC" })).toBe(false);
  });
});
