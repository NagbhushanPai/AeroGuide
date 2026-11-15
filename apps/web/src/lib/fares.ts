/**
 * Pure helpers for the fare search: formatting, passenger rules, URL state and the request body.
 * Leg times arrive as local wall-clock strings ("2026-12-06T06:05:00") and are shown as written:
 * never converted through a time zone.
 */

import {
  ApiError,
  type Cabin,
  type FareSearchRequest,
  type FareSort,
  type Leg,
  type Passengers,
} from "@/lib/api/client";

// ---- formatting ----

const priceFormats = new Map<string, Intl.NumberFormat>();

/** "₹1,23,456" (Indian digit grouping, no paise). Other currencies use their own symbol. */
export function formatPrice(amount: number, currency = "INR"): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "INR";
  let fmt = priceFormats.get(code);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    });
    priceFormats.set(code, fmt);
  }
  return fmt.format(amount);
}

export function formatInr(amount: number): string {
  return formatPrice(amount, "INR");
}

/** 140 -> "2h 20m", 45 -> "45m", 180 -> "3h". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest}m`;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/** "HH:MM" from a local ISO string, as written. */
export function localTime(iso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  return match ? `${match[1]}:${match[2]}` : "";
}

function dayNumber(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

/** Calendar days between two local ISO strings (arrival "+1" when it lands the next day). */
export function dayOffset(fromIso: string, toIso: string): number {
  const a = dayNumber(fromIso);
  const b = dayNumber(toIso);
  return a === null || b === null ? 0 : b - a;
}

/** Departure and arrival times of a leg, with how many days later it arrives. */
export function legTimes(leg: Pick<Leg, "departure_local" | "arrival_local">): {
  departs: string;
  arrives: string;
  plusDays: number;
} {
  return {
    departs: localTime(leg.departure_local),
    arrives: localTime(leg.arrival_local),
    plusDays: dayOffset(leg.departure_local, leg.arrival_local),
  };
}

/** Airports where the leg stops, from its segments: ["HYD"]. */
export function stopAirports(leg: Pick<Leg, "segments">): string[] {
  return leg.segments.slice(0, -1).map((s) => s.destination);
}

/** "Non-stop", "1 stop via HYD", "2 stops via HYD, BLR" (or "1 stop" when we don't know where). */
export function stopsLabel(leg: Pick<Leg, "stops" | "segments">): string {
  if (leg.stops <= 0) return "Non-stop";
  const count = `${leg.stops} stop${leg.stops === 1 ? "" : "s"}`;
  const via = stopAirports(leg);
  return via.length ? `${count} via ${via.join(", ")}` : count;
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2026-12-06" -> "Sun 6 Dec" (the date as written: an Indian calendar date, no shift). */
export function formatFareDate(isoDate: string): string {
  const day = dayNumber(isoDate);
  return day === null ? isoDate : dayFormat.format(new Date(day * 86_400_000));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function passengerCount(p: Passengers): number {
  return p.adults + p.children + p.infants_in_seat + p.infants_on_lap;
}

/** "1 adult", "2 adults, 1 child, 1 infant". */
export function passengersLabel(p: Passengers): string {
  const parts = [plural(p.adults, "adult", "adults")];
  if (p.children) parts.push(plural(p.children, "child", "children"));
  const infants = p.infants_in_seat + p.infants_on_lap;
  if (infants) parts.push(plural(infants, "infant", "infants"));
  return parts.join(", ");
}

export const CABINS: readonly { value: Cabin; label: string }[] = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium economy" },
  { value: "business", label: "Business" },
  { value: "first", label: "First" },
];

export function cabinLabel(cabin: string | null | undefined): string {
  return CABINS.find((c) => c.value === cabin)?.label ?? "Economy";
}

export const SORTS: readonly { value: FareSort; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "cheapest", label: "Cheapest" },
  { value: "fastest", label: "Fastest" },
];

// ---- passengers ----

export const MAX_PASSENGERS = 9;

export const DEFAULT_PASSENGERS: Passengers = {
  adults: 1,
  children: 0,
  infants_in_seat: 0,
  infants_on_lap: 0,
};

/** Why these passengers can't be searched, or null when they can. */
export function passengersError(p: Passengers): string | null {
  if (p.adults < 1) return "At least one adult has to travel.";
  if (passengerCount(p) > MAX_PASSENGERS)
    return `Up to ${MAX_PASSENGERS} passengers can be searched together.`;
  if (p.infants_on_lap > p.adults)
    return "Each infant on a lap needs an adult. Add an adult or give an infant a seat.";
  return null;
}

// ---- nearby airports ----

/** Cities with a second airport the API can add with `nearby_airports`. */
export const OTHER_AIRPORT: Readonly<Record<string, string>> = {
  DEL: "DXN",
  DXN: "DEL",
  BOM: "NMI",
  NMI: "BOM",
  GOI: "GOX",
  GOX: "GOI",
};

/** The other airports `nearby_airports` would add for this route. */
export function nearbyExtras(origin: string, destination: string): string[] {
  return [OTHER_AIRPORT[origin], OTHER_AIRPORT[destination]].filter(
    (code): code is string => !!code && code !== origin && code !== destination,
  );
}

// ---- departure time windows ----

export type TimeWindow = "early" | "morning" | "afternoon" | "evening";

export const TIME_WINDOWS: readonly {
  value: TimeWindow;
  label: string;
  range: string;
  after: number;
  before: number;
}[] = [
  { value: "early", label: "Early morning", range: "00:00–06:00", after: 0, before: 6 },
  { value: "morning", label: "Morning", range: "06:00–12:00", after: 6, before: 12 },
  { value: "afternoon", label: "Afternoon", range: "12:00–18:00", after: 12, before: 18 },
  { value: "evening", label: "Evening", range: "18:00–24:00", after: 18, before: 24 },
];

// ---- URL state ----

export type TripType = "oneway" | "round";

export type FareForm = {
  trip: TripType;
  origin: string;
  destination: string;
  depart: string;
  ret: string;
  passengers: Passengers;
  cabin: Cabin;
  sort: FareSort;
};

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isCode = (v: string) => /^[A-Z]{3}$/.test(v);

function count(raw: string | null, min: number, fallback: number): number {
  if (raw === null || !/^\d$/.test(raw)) return fallback;
  return Math.max(min, Number(raw));
}

/** The search form from the URL. Values that can't be read are dropped, never guessed. */
export function readFareParams(params: { get(key: string): string | null }): FareForm {
  const code = (key: string) => {
    const v = (params.get(key) ?? "").trim().toUpperCase();
    return isCode(v) ? v : "";
  };
  const date = (key: string) => {
    const v = params.get(key) ?? "";
    return isDate(v) ? v : "";
  };
  const ret = date("return");
  const cabin = params.get("cabin");
  const sort = params.get("sort");
  return {
    trip: params.get("trip") === "round" || ret ? "round" : "oneway",
    origin: code("from"),
    destination: code("to"),
    depart: date("depart"),
    ret,
    passengers: {
      adults: count(params.get("adults"), 1, 1),
      children: count(params.get("children"), 0, 0),
      infants_in_seat: count(params.get("seat"), 0, 0),
      infants_on_lap: count(params.get("lap"), 0, 0),
    },
    cabin: CABINS.some((c) => c.value === cabin) ? (cabin as Cabin) : "economy",
    sort: SORTS.some((s) => s.value === sort) ? (sort as FareSort) : "best",
  };
}

/** URL updates for the form. Defaults are left out so shared links stay short. */
export function fareParamUpdates(f: FareForm): Record<string, string | null> {
  const p = f.passengers;
  const round = f.trip === "round";
  return {
    from: f.origin || null,
    to: f.destination || null,
    depart: f.depart || null,
    trip: round ? "round" : null,
    return: round ? f.ret || null : null,
    adults: p.adults !== 1 ? String(p.adults) : null,
    children: p.children ? String(p.children) : null,
    seat: p.infants_in_seat ? String(p.infants_in_seat) : null,
    lap: p.infants_on_lap ? String(p.infants_on_lap) : null,
    cabin: f.cabin !== "economy" ? f.cabin : null,
    sort: f.sort !== "best" ? f.sort : null,
  };
}

// ---- validation and the request ----

/** Why the form can't be searched yet, or null when it can. */
export function formBlocker(f: FareForm, today: string): string | null {
  if (!f.origin && !f.destination) return "Pick where you're flying from and to.";
  if (!f.origin) return "Pick where you're flying from.";
  if (!f.destination) return "Pick where you're flying to.";
  if (f.origin === f.destination) return "From and To are the same airport. Pick another.";
  if (!f.depart) return "Pick a departure date.";
  if (f.depart < today) return "The departure date has passed. Pick today or later.";
  if (f.trip === "round") {
    if (!f.ret) return "Pick a return date, or choose One way.";
    if (f.ret < f.depart) return "The return date is before the departure date.";
  }
  return passengersError(f.passengers);
}

export type FareFilters = {
  maxStops: 0 | 1 | null;
  airlines: string[];
  time: TimeWindow | null;
  maxPrice: number | null;
};

export const NO_FILTERS: FareFilters = { maxStops: null, airlines: [], time: null, maxPrice: null };

export function hasFilters(f: FareFilters): boolean {
  return f.maxStops !== null || f.airlines.length > 0 || f.time !== null || f.maxPrice !== null;
}

/** The base search (what costs an upstream request): route, dates, passengers, cabin. */
export type BaseSearch = Pick<
  FareSearchRequest,
  "origin" | "destination" | "departure_date" | "return_date" | "passengers" | "cabin"
> & { nearby_airports: boolean };

export function baseSearch(f: FareForm, nearby: boolean): BaseSearch {
  return {
    origin: f.origin,
    destination: f.destination,
    departure_date: f.depart,
    ...(f.trip === "round" ? { return_date: f.ret } : {}),
    passengers: { ...f.passengers },
    cabin: f.cabin,
    nearby_airports: nearby && nearbyExtras(f.origin, f.destination).length > 0,
  };
}

/** The request body: only known fields, optional ones only when set (the API rejects extras). */
export function fareRequest(
  base: BaseSearch,
  filters: FareFilters,
  sort: FareSort,
): FareSearchRequest {
  const body: FareSearchRequest = { ...base, sort };
  if (filters.maxStops !== null) body.max_stops = filters.maxStops;
  if (filters.airlines.length) body.airlines = [...filters.airlines].sort();
  const slot = TIME_WINDOWS.find((w) => w.value === filters.time);
  if (slot) {
    body.depart_after_hour = slot.after;
    body.depart_before_hour = slot.before;
  }
  if (filters.maxPrice !== null) body.max_price = filters.maxPrice;
  return body;
}

// ---- errors ----

const FALLBACK: Record<number, string> = {
  404: "This fare is no longer available. Search again for current prices.",
  422: "The search couldn't be read. Check the airports and dates.",
  429: "Too many fare searches right now. Try again in a little while.",
  502: "The fare source couldn't answer this search. Try again in a moment.",
  503: "Fare search isn't available right now. Try again later.",
  504: "The fare source took too long to answer. Try again in a moment.",
};

/** What to tell people about a failed fare request: the API's own words when it gave some. */
export function fareErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.detail) return error.detail;
    return FALLBACK[error.status] ?? "The data service didn't respond. Try again in a moment.";
  }
  return "Couldn't reach the data service. It may still be starting up; try again in a moment.";
}
