import { describe, expect, it } from "vitest";

import type { SearchHit } from "../api/client";
import { groupHits, isTypingTarget } from "../site-search";
import { withParams } from "../url-state";

const hit = (kind: SearchHit["kind"], key: string): SearchHit => ({
  kind,
  key,
  title: key,
  subtitle: null,
  href: `/${kind}s/${key}`,
});

describe("groupHits", () => {
  it("orders groups airports, lounges, cards and keeps ranking inside", () => {
    const groups = groupHits([hit("card", "c1"), hit("airport", "BLR"), hit("card", "c2")]);
    expect(groups.map((g) => [g.kind, g.hits.map((h) => h.key)])).toEqual([
      ["airport", ["BLR"]],
      ["card", ["c1", "c2"]],
    ]);
  });
});

describe("isTypingTarget", () => {
  it("is true for text fields and false for buttons", () => {
    const text = document.createElement("input");
    const radio = document.createElement("input");
    radio.type = "radio";
    expect(isTypingTarget(text)).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(radio)).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("withParams", () => {
  it("sets and removes keys, leaving others alone", () => {
    expect(withParams("?q=x&bank=hdfc", { bank: null, airport: "BLR" })).toBe("?q=x&airport=BLR");
    expect(withParams("?card=a", { card: null })).toBe("");
  });
});
