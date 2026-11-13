import { describe, expect, it } from "vitest";

import {
  ageSeconds,
  displayVerification,
  formatAge,
  formatIst,
  formatIstDate,
  liveFreshness,
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
