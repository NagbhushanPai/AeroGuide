/**
 * Airport search over the map's static airports layer (public/data/airports-in.geojson, built
 * from OurAirports). Used by the live map, so it works without the API or database.
 */

export type MapAirport = {
  iata: string;
  icao: string | null;
  name: string;
  city: string | null;
  size: "large" | "medium" | "small";
  lon: number;
  lat: number;
};

type AirportsGeoJson = {
  features: {
    geometry: { coordinates: [number, number] };
    properties: Omit<MapAirport, "lon" | "lat">;
  }[];
};

export const AIRPORTS_GEOJSON_URL = "/data/airports-in.geojson";

export function parseAirports(data: AirportsGeoJson): MapAirport[] {
  return data.features.map((f) => ({
    ...f.properties,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

export async function loadMapAirports(signal?: AbortSignal): Promise<MapAirport[]> {
  const res = await fetch(AIRPORTS_GEOJSON_URL, { signal });
  if (!res.ok) throw new Error(`airports layer: ${res.status}`);
  return parseAirports((await res.json()) as AirportsGeoJson);
}

const SIZE_RANK = { large: 0, medium: 1, small: 2 } as const;

/**
 * Ranks: exact IATA, exact ICAO, city or name starting with the query, then contains.
 * Larger airports first within a rank. Empty query returns nothing.
 */
export function searchMapAirports(airports: MapAirport[], query: string, limit = 8): MapAirport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { a: MapAirport; score: number }[] = [];
  for (const a of airports) {
    const name = a.name.toLowerCase();
    const city = (a.city ?? "").toLowerCase();
    let score: number | null = null;
    if (a.iata.toLowerCase() === q) score = 0;
    else if (a.icao?.toLowerCase() === q) score = 1;
    else if (city.startsWith(q) || name.startsWith(q)) score = 2;
    else if (city.includes(q) || name.includes(q)) score = 3;
    if (score !== null) scored.push({ a, score });
  }
  return scored
    .sort(
      (x, y) =>
        x.score - y.score ||
        SIZE_RANK[x.a.size] - SIZE_RANK[y.a.size] ||
        x.a.name.localeCompare(y.a.name),
    )
    .slice(0, limit)
    .map((s) => s.a);
}
