import { describe, expect, it } from "vitest";

import { entryLabel, formatInr, formatOpeningHours } from "../lounges";

describe("formatOpeningHours", () => {
  it("returns null when hours aren't verified", () => {
    expect(formatOpeningHours(null)).toBeNull();
  });

  it("formats 24-hour lounges", () => {
    expect(formatOpeningHours({ mode: "24h" })).toEqual(["Open 24 hours"]);
  });

  it("collapses consecutive days and marks overnight periods", () => {
    expect(
      formatOpeningHours({
        mode: "weekly",
        periods: [
          { days: ["fri", "mon", "tue", "wed", "thu"], open: "05:00", close: "23:00" },
          { days: ["sat", "sun"], open: "20:00", close: "02:00" },
        ],
      }),
    ).toEqual(["Mon–Fri 05:00–23:00", "Sat, Sun 20:00–02:00 (next day)"]);
  });

  it("says Daily for all seven days", () => {
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    expect(
      formatOpeningHours({ mode: "weekly", periods: [{ days, open: "00:00", close: "23:59" }] }),
    ).toEqual(["Daily 00:00–23:59"]);
  });
});

describe("labels", () => {
  it("formats rupees in the Indian style", () => {
    expect(formatInr(150000)).toBe("₹1,50,000");
  });

  it("falls back to the raw entry method", () => {
    expect(entryLabel("card_swipe")).toMatch(/Swipe/);
    expect(entryLabel("mystery")).toBe("mystery");
  });
});
