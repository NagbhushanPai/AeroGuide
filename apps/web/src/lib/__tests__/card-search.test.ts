import { describe, expect, it } from "vitest";

import type { CardSummary } from "../api/client";
import { groupByBank, matchCards, networksOf } from "../card-search";

const card = (slug: string, name: string, bank: string, network: string | null = null) =>
  ({
    slug,
    name,
    bank: { slug: bank.toLowerCase().replace(/\s+/g, "-"), name: bank, url: "https://example.org" },
    network,
    status: "verified",
    domestic: null,
    international: null,
  }) satisfies CardSummary;

const cards = [
  card("hdfc-infinia", "Infinia Metal", "HDFC Bank", "Visa"),
  card("hdfc-regalia", "Regalia Gold", "HDFC Bank", "Mastercard"),
  card("axis-magnus", "Magnus", "Axis Bank", "Visa"),
  card("axis-atlas", "Atlas", "Axis Bank", null),
];

describe("matchCards", () => {
  it("finds a card by its name", () => {
    expect(matchCards(cards, "infinia").map((c) => c.slug)).toEqual(["hdfc-infinia"]);
  });
  it("finds every card of a bank", () => {
    expect(matchCards(cards, "hdfc").map((c) => c.slug)).toEqual(["hdfc-infinia", "hdfc-regalia"]);
  });
  it("needs every word to match the start of a word", () => {
    expect(matchCards(cards, "axis mag").map((c) => c.slug)).toEqual(["axis-magnus"]);
    expect(matchCards(cards, "xis")).toEqual([]);
  });
  it("keeps the order for an empty query", () => {
    expect(matchCards(cards, " ")).toEqual(cards);
  });
});

describe("groupByBank", () => {
  it("groups in order of first appearance", () => {
    const groups = groupByBank([cards[2], cards[0], cards[3]]);
    expect(groups.map((g) => [g.bank.name, g.cards.length])).toEqual([
      ["Axis Bank", 2],
      ["HDFC Bank", 1],
    ]);
  });
});

describe("networksOf", () => {
  it("lists stated networks once", () => {
    expect(networksOf(cards)).toEqual(["Mastercard", "Visa"]);
  });
});
