/** Display helpers for live aircraft. Missing values return null so callers show "Not available". */

const TYPE_NAMES: Record<string, string> = {
  A19N: "Airbus A319neo",
  A20N: "Airbus A320neo",
  A21N: "Airbus A321neo",
  A319: "Airbus A319",
  A320: "Airbus A320",
  A321: "Airbus A321",
  A332: "Airbus A330-200",
  A333: "Airbus A330-300",
  A339: "Airbus A330-900",
  A359: "Airbus A350-900",
  A35K: "Airbus A350-1000",
  A388: "Airbus A380",
  B737: "Boeing 737-700",
  B738: "Boeing 737-800",
  B739: "Boeing 737-900",
  B38M: "Boeing 737 MAX 8",
  B39M: "Boeing 737 MAX 9",
  B744: "Boeing 747-400",
  B748: "Boeing 747-8",
  B752: "Boeing 757-200",
  B763: "Boeing 767-300",
  B772: "Boeing 777-200",
  B77L: "Boeing 777-200LR",
  B77W: "Boeing 777-300ER",
  B788: "Boeing 787-8",
  B789: "Boeing 787-9",
  B78X: "Boeing 787-10",
  AT72: "ATR 72",
  AT75: "ATR 72-500",
  AT76: "ATR 72-600",
  DH8D: "Dash 8-400",
  E190: "Embraer E190",
  E195: "Embraer E195",
  C130: "C-130 Hercules",
  C30J: "C-130J Super Hercules",
  C17: "C-17 Globemaster III",
};

export function typeName(code: string | null | undefined): string | null {
  if (!code) return null;
  return TYPE_NAMES[code] ? `${TYPE_NAMES[code]} (${code})` : code;
}

export function formatAltitude(ft: number | null | undefined, onGround: boolean): string | null {
  if (onGround) return "On ground";
  if (ft === null || ft === undefined) return null;
  return `${Math.round(ft).toLocaleString("en-IN")} ft`;
}

export function formatSpeed(kt: number | null | undefined): string | null {
  if (kt === null || kt === undefined) return null;
  return `${Math.round(kt)} kt · ${Math.round(kt * 1.852)} km/h`;
}

export function formatHeading(deg: number | null | undefined): string | null {
  if (deg === null || deg === undefined) return null;
  return `${Math.round(deg)}°`;
}

export function formatVerticalRate(fpm: number | null | undefined): string | null {
  if (fpm === null || fpm === undefined) return null;
  if (Math.abs(fpm) < 100) return "Level";
  return `${fpm > 0 ? "Climbing" : "Descending"} ${Math.abs(Math.round(fpm)).toLocaleString("en-IN")} ft/min`;
}

export function formatMinutes(min: number | null | undefined): string | null {
  if (min === null || min === undefined) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${m.toString().padStart(2, "0")} min` : `${m} min`;
}

/** Best label for an aircraft: flight number, then callsign, then registration, then hex. */
export function displayName(p: {
  flight_number?: string | null;
  callsign: string | null;
  registration: string | null;
  icao24: string;
}): string {
  return p.flight_number ?? p.callsign ?? p.registration ?? p.icao24.toUpperCase();
}
