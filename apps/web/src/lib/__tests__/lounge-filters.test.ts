import { describe, expect, it } from "vitest";

import { filterLounges, groupLoungesByAirport, readLoungeFilters } from "../lounges";

const base = {
  airport_name: "Test Airport",
  city: "Bengaluru",
  terminal: "T1",
  side: "airside" as const,
  scope: "domestic" as const,
  programs: [{ key: "test-pass", name: "Test Pass" }],
};
const lounges = [
  { ...base, name: "Alpha Lounge", iata: "BLR" },
  { ...base, name: "Bravo Lounge", iata: "BLR", terminal: "T2", scope: "both" as const },
  {
    ...base,
    name: "Charlie Lounge",
    iata: "DEL",
    city: "Delhi",
    side: "landside" as const,
    programs: [],
  },
];
const none = readLoungeFilters(new URLSearchParams());

describe("readLoungeFilters", () => {
  it("normalises the airport and drops unknown values", () => {
    const f = readLoungeFilters(new URLSearchParams("airport=blr&side=moon&scope=international"));
    expect(f).toMatchObject({ airport: "BLR", side: "", scope: "international" });
  });
});

describe("filterLounges", () => {
  it("filters by airport, terminal, side and programme", () => {
    expect(filterLounges(lounges, { ...none, airport: "BLR" })).toHaveLength(2);
    expect(filterLounges(lounges, { ...none, terminal: "T2" }).map((l) => l.name)).toEqual([
      "Bravo Lounge",
    ]);
    expect(filterLounges(lounges, { ...none, side: "landside" })).toHaveLength(1);
    expect(filterLounges(lounges, { ...none, program: "test-pass" })).toHaveLength(2);
  });
  it("matches 'both' lounges for either scope", () => {
    expect(filterLounges(lounges, { ...none, scope: "international" }).map((l) => l.name)).toEqual([
      "Bravo Lounge",
    ]);
  });
  it("matches every word of the text filter", () => {
    expect(filterLounges(lounges, { ...none, q: "delhi charlie" })).toHaveLength(1);
    expect(filterLounges(lounges, { ...none, q: "test pass bravo" })).toHaveLength(1);
  });
});

describe("groupLoungesByAirport", () => {
  it("groups by airport, sorted by city", () => {
    const groups = groupLoungesByAirport([lounges[2], lounges[0], lounges[1]]);
    expect(groups.map((g) => [g.iata, g.lounges.length])).toEqual([
      ["BLR", 2],
      ["DEL", 1],
    ]);
  });
});
