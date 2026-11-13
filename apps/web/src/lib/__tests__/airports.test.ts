import { describe, expect, it } from "vitest";

import { parseAirports, searchMapAirports, type MapAirport } from "../airports";

const airport = (iata: string, name: string, city: string | null, size: MapAirport["size"]) =>
  ({ iata, icao: `V${iata}`, name, city, size, lon: 77, lat: 28 }) satisfies MapAirport;

const AIRPORTS = [
  airport("AAA", "Alpha International Airport", "Alphaville", "large"),
  airport("BBB", "Bravo Airport", "Alphaville North", "small"),
  airport("CCC", "Charlie Airport", "Charlieton", "medium"),
  airport("DDD", "Alpha Field", "Delta City", "medium"),
];

describe("searchMapAirports", () => {
  it("returns nothing for an empty query", () => {
    expect(searchMapAirports(AIRPORTS, "  ")).toEqual([]);
  });

  it("puts an exact IATA code first", () => {
    expect(searchMapAirports(AIRPORTS, "ccc")[0]?.iata).toBe("CCC");
  });

  it("matches ICAO codes exactly", () => {
    expect(searchMapAirports(AIRPORTS, "vddd").map((a) => a.iata)).toEqual(["DDD"]);
  });

  it("ranks prefix matches before contains, larger airports first", () => {
    expect(searchMapAirports(AIRPORTS, "alpha").map((a) => a.iata)).toEqual(["AAA", "DDD", "BBB"]);
    expect(searchMapAirports(AIRPORTS, "north").map((a) => a.iata)).toEqual(["BBB"]);
  });

  it("respects the limit", () => {
    expect(searchMapAirports(AIRPORTS, "a", 2)).toHaveLength(2);
  });
});

describe("parseAirports", () => {
  it("reads coordinates as lon, lat", () => {
    const [a] = parseAirports({
      features: [
        {
          geometry: { coordinates: [72.8, 19.1] },
          properties: { iata: "XXX", icao: null, name: "X", city: null, size: "large" },
        },
      ],
    });
    expect(a).toMatchObject({ iata: "XXX", lon: 72.8, lat: 19.1 });
  });
});
