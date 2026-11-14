import { describe, expect, it } from "vitest";

import type { CardSummary, EligibilityResponse, LoungeSummary } from "../api/client";
import {
  checkerParamUpdates,
  formatTravelDate,
  parseWholeNumber,
  readCheckerParams,
  resultsByLounge,
} from "../checker";

const bank = { slug: "test-bank", name: "Test Bank", url: "https://example.org" };
const card = (slug: string): CardSummary => ({
  slug,
  name: slug,
  bank,
  network: null,
  status: "verified",
  domestic: null,
  international: null,
});
const lounge = (slug: string, name = slug): LoungeSummary => ({
  slug,
  name,
  iata: "BLR",
  airport_name: "Test Airport",
  city: "Bengaluru",
  terminal: "T1",
  scope: "domestic",
  side: "airside",
  direction: "departures",
  status: "verified",
  programs: [],
});
const result = (l: LoungeSummary, status: "yes" | "no" | "depends") => ({
  lounge: l,
  status,
  checks: [],
  via_programs: [],
  guests_covered: null,
  entry: [],
  notes: [],
  policy_summary: null,
});

describe("parseWholeNumber", () => {
  it("treats empty as not given", () => {
    expect(parseWholeNumber("")).toEqual({ value: null, error: null });
    expect(parseWholeNumber("  ")).toEqual({ value: null, error: null });
  });
  it("accepts commas, spaces and the rupee sign", () => {
    expect(parseWholeNumber("₹60,000").value).toBe(60000);
    expect(parseWholeNumber("1 00 000").value).toBe(100000);
  });
  it("never turns text into 0", () => {
    const r = parseWholeNumber("abc");
    expect(r.value).toBeNull();
    expect(r.error).toMatch(/whole number/);
    expect(parseWholeNumber("-1").error).not.toBeNull();
    expect(parseWholeNumber("1.5").error).not.toBeNull();
  });
});

describe("checker URL params", () => {
  const params = (q: string) => new URLSearchParams(q);
  it("reads valid airport, date and scope", () => {
    expect(readCheckerParams(params("airport=blr&on=2026-11-20&scope=international"))).toEqual({
      airport: "BLR",
      on: "2026-11-20",
      scope: "international",
    });
  });
  it("drops invalid values", () => {
    expect(readCheckerParams(params("airport=bangalore&on=tomorrow&scope=x"))).toEqual({
      airport: "",
      on: "",
      scope: "domestic",
    });
  });
  it("never writes cards, and consumes ?card=", () => {
    const u = checkerParamUpdates({ airport: "BLR", on: "", scope: "domestic" });
    expect(u).toEqual({ airport: "BLR", on: null, scope: "domestic", card: null });
  });
});

describe("formatTravelDate", () => {
  it("formats without shifting the day", () => {
    expect(formatTravelDate("2026-11-20")).toBe("20 Nov 2026");
  });
});

describe("resultsByLounge", () => {
  it("merges cards per lounge and sorts yes, depends, no", () => {
    const a = lounge("a", "Alpha");
    const b = lounge("b", "Bravo");
    const c = lounge("c", "Charlie");
    const data: EligibilityResponse = {
      airport: "BLR",
      on: "2026-11-20",
      scope: "domestic",
      lounges_listed: 3,
      unknown_cards: [],
      disclaimer: "",
      results: [
        { card: card("one"), lounges: [result(a, "no"), result(b, "depends"), result(c, "no")] },
        { card: card("two"), lounges: [result(a, "no"), result(b, "no"), result(c, "yes")] },
      ],
    };
    const rows = resultsByLounge(data);
    expect(rows.map((r) => [r.lounge.slug, r.best])).toEqual([
      ["c", "yes"],
      ["b", "depends"],
      ["a", "no"],
    ]);
    // The card that gets in is listed first.
    expect(rows[0].verdicts.map((v) => v.card.slug)).toEqual(["two", "one"]);
  });
});
