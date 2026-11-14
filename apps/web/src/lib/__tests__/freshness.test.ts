import { describe, expect, it } from "vitest";

import {
  ageSeconds,
  displayVerification,
  formatAge,
  formatIst,
  formatIstDate,
  formatIstTime,
  formatIstWithDay,
  liveFreshness,
  todayIst,
} from "@/lib/freshness";

const NOW = new Date("2026-11-13T12:00:00Z");

describe("ageSeconds", () => {
  it("returns whole seconds since the timestamp", () => {
    expect(ageSeconds("2026-11-13T11:59:30Z", NOW)).toBe(30);
  });

  it("never returns a negative age for future timestamps", () => {
    expect(ageSeconds("2026-11-13T12:05:00Z", NOW)).toBe(0);
  });

  it("rejects invalid timestamps instead of guessing", () => {
    expect(() => ageSeconds("not a date", NOW)).toThrow();
  });
});

describe("liveFreshness", () => {
  it.each([
    [0, "fresh"],
    [89, "fresh"],
    [90, "stale"],
    [299, "stale"],
    [300, "expired"],
  ] as const)("age %i s is %s", (age, expected) => {
    expect(liveFreshness(age)).toBe(expected);
  });
});

describe("formatAge", () => {
  it.each([
    [2, "just now"],
    [45, "45 s ago"],
    [125, "2 min ago"],
    [3 * 3600, "3 h ago"],
    [86_400, "1 day ago"],
    [3 * 86_400, "3 days ago"],
  ])("%i s → %s", (seconds, expected) => {
    expect(formatAge(seconds)).toBe(expected);
  });
});

describe("displayVerification", () => {
  it("keeps a recent verification as verified", () => {
    expect(displayVerification("verified", "2026-11-01", 60, NOW)).toBe("verified");
  });

  it("marks a verification past its window as outdated", () => {
    expect(displayVerification("verified", "2026-08-01", 60, NOW)).toBe("outdated");
  });

  it("never upgrades unverified or unavailable records", () => {
    expect(displayVerification("unverified", null, 60, NOW)).toBe("unverified");
    expect(displayVerification("unavailable", "2026-11-01", 60, NOW)).toBe("unavailable");
  });

  it("never shows a verified record without a verification date as verified", () => {
    expect(displayVerification("verified", null, 60, NOW)).toBe("unverified");
  });
});

describe("IST formatting", () => {
  it("formats in Asia/Kolkata regardless of the machine time zone", () => {
    expect(formatIst("2026-11-13T13:10:00Z")).toBe("13 Nov 2026, 18:40 IST");
    expect(formatIstDate("2026-11-13T20:00:00Z")).toBe("14 Nov 2026");
  });
});

describe("todayIst", () => {
  it("uses the Indian calendar date, not the UTC one", () => {
    // 20:00 UTC on 13 Nov is 01:30 IST on 14 Nov.
    expect(todayIst(new Date("2026-11-13T20:00:00Z"))).toBe("2026-11-14");
    expect(todayIst(new Date("2026-11-13T12:00:00Z"))).toBe("2026-11-13");
  });
});

describe("formatIstWithDay", () => {
  const now = new Date("2026-11-13T16:00:00Z"); // 21:30 IST
  it("shows only the time for today", () => {
    expect(formatIstTime("2026-11-13T17:00:00Z")).toBe("22:30 IST");
    expect(formatIstWithDay("2026-11-13T17:00:00Z", now)).toBe("22:30 IST");
  });
  it("names tomorrow and yesterday", () => {
    expect(formatIstWithDay("2026-11-13T20:10:00Z", now)).toBe("Tomorrow 01:40 IST");
    expect(formatIstWithDay("2026-11-12T17:40:00Z", now)).toBe("Yesterday 23:10 IST");
  });
  it("gives the date further out", () => {
    expect(formatIstWithDay("2026-11-15T20:10:00Z", now)).toBe("16 Nov, 01:40 IST");
  });
});
