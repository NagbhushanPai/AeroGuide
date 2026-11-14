import { describe, expect, it } from "vitest";

import { absoluteUrl, isActive, mainNav, SITE_URL } from "@/lib/site";

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

  it("has a short label for the mobile tab bar", () => {
    expect(mainNav.map((item) => item.shortLabel)).toEqual([
      "Map",
      "Airports",
      "Lounges",
      "Cards",
      "About",
    ]);
  });
});

describe("absoluteUrl", () => {
  it("joins the site URL and a path without doubling slashes", () => {
    expect(SITE_URL.endsWith("/")).toBe(false);
    expect(absoluteUrl("/airports/DEL")).toBe(`${SITE_URL}/airports/DEL`);
    expect(absoluteUrl("about")).toBe(`${SITE_URL}/about`);
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
