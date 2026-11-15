import { describe, expect, it } from "vitest";

import { ApiError, errorDetail } from "../api/client";
import {
  baseSearch,
  dayOffset,
  fareErrorMessage,
  fareParamUpdates,
  fareRequest,
  formatDuration,
  formatFareDate,
  formatInr,
  formatPrice,
  formBlocker,
  legTimes,
  nearbyExtras,
  NO_FILTERS,
  passengersError,
  passengersLabel,
  readFareParams,
  stopsLabel,
  type FareForm,
} from "../fares";

const segment = (origin: string, destination: string) => ({
  carrier_code: "6E",
  carrier_name: "IndiGo",
  flight_number: "6E1",
  origin,
  destination,
  departure_local: "2026-12-06T06:05:00",
  departure_timezone: "Asia/Kolkata",
  departure_utc: null,
  arrival_local: "2026-12-06T08:25:00",
  arrival_timezone: "Asia/Kolkata",
  arrival_utc: null,
  duration_minutes: 140,
  aircraft: null,
});

const pax = { adults: 1, children: 0, infants_in_seat: 0, infants_on_lap: 0 };
const form: FareForm = {
  trip: "oneway",
  origin: "DEL",
  destination: "BOM",
  depart: "2026-12-06",
  ret: "",
  passengers: pax,
  cabin: "economy",
  sort: "best",
};
const params = (qs: string) => new URLSearchParams(qs);

describe("formatPrice", () => {
  it("groups rupees the Indian way, without paise", () => {
    expect(formatInr(123456)).toBe("₹1,23,456");
    expect(formatInr(4520)).toBe("₹4,520");
    expect(formatPrice(10000000, "INR")).toBe("₹1,00,00,000");
    expect(formatInr(4520.6)).toBe("₹4,521");
  });
  it("uses the offer's own currency when it isn't rupees", () => {
    expect(formatPrice(1234, "USD")).toMatch(/^(US)?\$1,234$/);
  });
});

describe("formatDuration", () => {
  it.each([
    [140, "2h 20m"],
    [45, "45m"],
    [180, "3h"],
    [0, "0m"],
    [605, "10h 5m"],
  ])("%i minutes is %s", (m, label) => expect(formatDuration(m)).toBe(label));
});

describe("legTimes", () => {
  it("reads local times as written, without a time-zone shift", () => {
    expect(
      legTimes({ departure_local: "2026-12-06T06:05:00", arrival_local: "2026-12-06T08:25:00" }),
    ).toEqual({ departs: "06:05", arrives: "08:25", plusDays: 0 });
  });
  it("marks an arrival on the next day", () => {
    expect(
      legTimes({ departure_local: "2026-12-06T22:40:00", arrival_local: "2026-12-07T01:10:00" })
        .plusDays,
    ).toBe(1);
    expect(dayOffset("2026-12-31T23:00:00", "2027-01-01T01:00:00")).toBe(1);
  });
});

describe("stopsLabel", () => {
  it("says non-stop, or where the stops are", () => {
    expect(stopsLabel({ stops: 0, segments: [segment("DEL", "BOM")] })).toBe("Non-stop");
    expect(stopsLabel({ stops: 1, segments: [segment("DEL", "HYD"), segment("HYD", "BOM")] })).toBe(
      "1 stop via HYD",
    );
    expect(
      stopsLabel({
        stops: 2,
        segments: [segment("DEL", "HYD"), segment("HYD", "BLR"), segment("BLR", "COK")],
      }),
    ).toBe("2 stops via HYD, BLR");
    expect(stopsLabel({ stops: 1, segments: [] })).toBe("1 stop");
  });
});

describe("dates and labels", () => {
  it("formats an Indian calendar date without shifting it", () => {
    expect(formatFareDate("2026-12-06")).toBe("Sun 6 Dec");
    expect(formatFareDate("2026-12-06T23:30:00")).toBe("Sun 6 Dec");
  });
  it("summarises passengers", () => {
    expect(passengersLabel(pax)).toBe("1 adult");
    expect(passengersLabel({ adults: 2, children: 1, infants_in_seat: 1, infants_on_lap: 1 })).toBe(
      "2 adults, 1 child, 2 infants",
    );
  });
});

describe("passengersError", () => {
  it("accepts a normal party", () => {
    expect(passengersError(pax)).toBeNull();
  });
  it("needs an adult, at most 9 people, and an adult per lap infant", () => {
    expect(passengersError({ ...pax, adults: 0 })).toMatch(/one adult/);
    expect(passengersError({ ...pax, adults: 6, children: 4 })).toMatch(/Up to 9/);
    expect(passengersError({ ...pax, adults: 1, infants_on_lap: 2 })).toMatch(/lap/);
  });
});

describe("formBlocker", () => {
  const today = "2026-11-15";
  it("explains what's missing, one thing at a time", () => {
    expect(formBlocker({ ...form, origin: "", destination: "" }, today)).toMatch(/from and to/);
    expect(formBlocker({ ...form, destination: "DEL" }, today)).toMatch(/same airport/);
    expect(formBlocker({ ...form, depart: "" }, today)).toMatch(/departure date/);
    expect(formBlocker({ ...form, depart: "2026-11-14" }, today)).toMatch(/passed/);
    expect(formBlocker({ ...form, trip: "round" }, today)).toMatch(/return date/);
    expect(formBlocker({ ...form, trip: "round", ret: "2026-12-01" }, today)).toMatch(/before/);
    expect(formBlocker(form, today)).toBeNull();
  });
});

describe("URL state", () => {
  it("round-trips the form, leaving defaults out", () => {
    expect(fareParamUpdates(form)).toEqual({
      from: "DEL",
      to: "BOM",
      depart: "2026-12-06",
      trip: null,
      return: null,
      adults: null,
      children: null,
      seat: null,
      lap: null,
      cabin: null,
      sort: null,
    });
    const round: FareForm = {
      ...form,
      trip: "round",
      ret: "2026-12-10",
      passengers: { adults: 2, children: 1, infants_in_seat: 0, infants_on_lap: 1 },
      cabin: "business",
      sort: "cheapest",
    };
    const qs = new URLSearchParams(
      Object.entries(fareParamUpdates(round)).filter((e): e is [string, string] => !!e[1]),
    );
    expect(readFareParams(qs)).toEqual(round);
  });
  it("drops values it can't read", () => {
    const f = readFareParams(params("from=delhi&to=bom&depart=soon&cabin=jet&sort=x&adults=12"));
    expect(f.origin).toBe("");
    expect(f.destination).toBe("BOM");
    expect(f.depart).toBe("");
    expect(f.cabin).toBe("economy");
    expect(f.sort).toBe("best");
    expect(f.passengers.adults).toBe(1);
  });
});

describe("fareRequest", () => {
  it("sends only the fields that are set", () => {
    expect(fareRequest(baseSearch(form, false), NO_FILTERS, "best")).toEqual({
      origin: "DEL",
      destination: "BOM",
      departure_date: "2026-12-06",
      passengers: pax,
      cabin: "economy",
      nearby_airports: false,
      sort: "best",
    });
  });
  it("maps filters to the API's fields", () => {
    const body = fareRequest(
      baseSearch({ ...form, trip: "round", ret: "2026-12-09" }, true),
      { maxStops: 0, airlines: ["UK", "6E"], time: "morning", maxPrice: 9000 },
      "cheapest",
    );
    expect(body).toMatchObject({
      return_date: "2026-12-09",
      nearby_airports: true,
      max_stops: 0,
      airlines: ["6E", "UK"],
      depart_after_hour: 6,
      depart_before_hour: 12,
      max_price: 9000,
      sort: "cheapest",
    });
  });
  it("only asks for nearby airports where a city has two", () => {
    expect(nearbyExtras("DEL", "BOM")).toEqual(["DXN", "NMI"]);
    expect(nearbyExtras("GOI", "BLR")).toEqual(["GOX"]);
    expect(nearbyExtras("BLR", "MAA")).toEqual([]);
    expect(baseSearch({ ...form, origin: "BLR", destination: "MAA" }, true).nearby_airports).toBe(
      false,
    );
  });
});

describe("errors", () => {
  it("reads FastAPI's detail, as text or a list", () => {
    expect(errorDetail({ detail: "DXB isn't an Indian airport we list." })).toBe(
      "DXB isn't an Indian airport we list.",
    );
    expect(
      errorDetail({ detail: [{ loc: ["body", "origin"], msg: "Value error, Use a code." }] }),
    ).toBe("Use a code.");
    expect(errorDetail(null)).toBeNull();
  });
  it("prefers the API's words, then a plain fallback", () => {
    expect(fareErrorMessage(new ApiError(429, "429", "Today's searches are used up."))).toBe(
      "Today's searches are used up.",
    );
    expect(fareErrorMessage(new ApiError(504, "504"))).toMatch(/too long/);
    expect(fareErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Couldn't reach/);
  });
});
