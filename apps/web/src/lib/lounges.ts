/** Display helpers for lounge records. Never invent a value: unknown stays unknown. */

type Period = { days: string[]; open: string; close: string };
export type OpeningHours = { mode: "24h" | "weekly"; periods?: Period[] } | null;

const DAY_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function dayRange(days: string[]): string {
  const sorted = [...days].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b));
  if (sorted.length === 7) return "Daily";
  const idx = sorted.map((d) => WEEK.indexOf(d));
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (consecutive && sorted.length > 2) {
    return `${DAY_LABEL[sorted[0]]}–${DAY_LABEL[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => DAY_LABEL[d] ?? d).join(", ");
}

/** Lines such as "Open 24 hours" or "Mon–Fri 05:00–23:00". Null when hours aren't verified. */
export function formatOpeningHours(hours: OpeningHours): string[] | null {
  if (!hours) return null;
  if (hours.mode === "24h") return ["Open 24 hours"];
  return (hours.periods ?? []).map((p) => {
    const overnight = p.close <= p.open ? " (next day)" : "";
    return `${dayRange(p.days)} ${p.open}–${p.close}${overnight}`;
  });
}

const SCOPE_LABEL = {
  domestic: "Domestic departures",
  international: "International departures",
  both: "Domestic and international",
} as const;

export function scopeLabel(scope: keyof typeof SCOPE_LABEL): string {
  return SCOPE_LABEL[scope];
}

const ENTRY_LABEL: Record<string, string> = {
  card_swipe: "Swipe the card at the lounge",
  programme_card: "Show the programme membership card",
  app_pass: "Show a pass from the programme's app",
  voucher: "Use a voucher",
  other: "See the bank's terms",
};

export function entryLabel(method: string): string {
  return ENTRY_LABEL[method] ?? method;
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

const DIRECTION_LABEL = {
  departures: "Departures lounge",
  arrivals: "Arrivals lounge",
  transit: "Transit lounge",
} as const;

export function directionLabel(direction: keyof typeof DIRECTION_LABEL): string {
  return DIRECTION_LABEL[direction];
}

export function sideLabel(side: "airside" | "landside"): string {
  return side === "airside" ? "After security" : "Before security";
}

/** Lounge filters as kept in the URL. Empty string means "any". */
export type LoungeFilters = {
  q: string;
  airport: string;
  terminal: string;
  side: "" | "airside" | "landside";
  scope: "" | "domestic" | "international";
  program: string;
};

export function readLoungeFilters(params: { get(key: string): string | null }): LoungeFilters {
  const side = params.get("side");
  const scope = params.get("scope");
  const airport = (params.get("airport") ?? "").trim().toUpperCase();
  return {
    q: (params.get("q") ?? "").trim(),
    airport: /^[A-Z]{3}$/.test(airport) ? airport : "",
    terminal: params.get("terminal") ?? "",
    side: side === "airside" || side === "landside" ? side : "",
    scope: scope === "domestic" || scope === "international" ? scope : "",
    program: params.get("program") ?? "",
  };
}

type FilterableLounge = {
  name: string;
  iata: string;
  airport_name: string;
  city: string | null;
  terminal: string | null;
  side: "airside" | "landside";
  scope: "domestic" | "international" | "both";
  programs: { key: string; name: string }[];
};

/** Lounges matching every filter. A "both" lounge matches either scope. */
export function filterLounges<T extends FilterableLounge>(
  lounges: readonly T[],
  f: LoungeFilters,
): T[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return lounges.filter((l) => {
    if (f.airport && l.iata !== f.airport) return false;
    if (f.terminal && l.terminal !== f.terminal) return false;
    if (f.side && l.side !== f.side) return false;
    if (f.scope && l.scope !== f.scope && l.scope !== "both") return false;
    if (f.program && !l.programs.some((p) => p.key === f.program)) return false;
    if (words.length) {
      const hay = [
        l.name,
        l.iata,
        l.airport_name,
        l.city,
        l.terminal,
        ...l.programs.map((p) => p.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export type AirportLoungeGroup<T> = {
  iata: string;
  city: string | null;
  airportName: string;
  lounges: T[];
};

/** Groups lounges by airport, airports sorted by city then code. */
export function groupLoungesByAirport<T extends FilterableLounge>(
  lounges: readonly T[],
): AirportLoungeGroup<T>[] {
  const groups = new Map<string, AirportLoungeGroup<T>>();
  for (const l of lounges) {
    const g = groups.get(l.iata);
    if (g) g.lounges.push(l);
    else
      groups.set(l.iata, { iata: l.iata, city: l.city, airportName: l.airport_name, lounges: [l] });
  }
  return [...groups.values()].sort(
    (a, b) =>
      (a.city ?? a.airportName).localeCompare(b.city ?? b.airportName) ||
      a.iata.localeCompare(b.iata),
  );
}
