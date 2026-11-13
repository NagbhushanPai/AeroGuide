import { describe, expect, it } from "vitest";

import { isActive, mainNav } from "@/lib/site";

const byHref = (href: string) => mainNav.find((item) => item.href === href)!;

describe("mainNav", () => {
  it("has the five primary sections in order", () => {
    expect(mainNav.map((item) => item.label)).toEqual([
      "Live Map",
      "Airports",
      "Lounges",
      "Cards",
      "About",
    ]);
  });
});

describe("isActive", () => {
  it("matches the live map only on the root path", () => {
    expect(isActive(byHref("/"), "/")).toBe(true);
    expect(isActive(byHref("/"), "/airports")).toBe(false);
  });

  it("matches a section and its nested pages", () => {
    expect(isActive(byHref("/cards"), "/cards")).toBe(true);
    expect(isActive(byHref("/cards"), "/cards/eligibility")).toBe(true);
  });

  it("does not match sections that only share a prefix", () => {
    expect(isActive(byHref("/cards"), "/cardsharing")).toBe(false);
  });
});
