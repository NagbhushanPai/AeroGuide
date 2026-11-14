/** Matching and grouping for card lists (the checker's picker and the card directory). */

import type { BankRef, CardSummary } from "@/lib/api/client";

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function haystack(card: CardSummary): string[] {
  return words(`${card.bank.name} ${card.bank.slug} ${card.name} ${card.network ?? ""}`);
}

/**
 * Cards matching every word of `query`, where each word starts a word of the bank name, card
 * name or network ("axis mag" finds Axis Bank Magnus). Best matches first; an empty query keeps
 * the original order.
 */
export function matchCards(cards: readonly CardSummary[], query: string): CardSummary[] {
  const q = words(query);
  if (q.length === 0) return [...cards];
  const scored: { card: CardSummary; score: number; index: number }[] = [];
  cards.forEach((card, index) => {
    const hay = haystack(card);
    const nameWords = words(card.name);
    let score = 0;
    for (const w of q) {
      if (nameWords.some((h) => h === w)) score += 0;
      else if (hay.some((h) => h === w)) score += 1;
      else if (nameWords.some((h) => h.startsWith(w))) score += 2;
      else if (hay.some((h) => h.startsWith(w))) score += 3;
      else return;
    }
    scored.push({ card, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.card);
}

export type BankGroup = { bank: BankRef; cards: CardSummary[] };

/** Groups cards by bank, banks in order of first appearance. */
export function groupByBank(cards: readonly CardSummary[]): BankGroup[] {
  const groups = new Map<string, BankGroup>();
  for (const c of cards) {
    const g = groups.get(c.bank.slug);
    if (g) g.cards.push(c);
    else groups.set(c.bank.slug, { bank: c.bank, cards: [c] });
  }
  return [...groups.values()];
}

/** Networks named across the list, sorted, without "not stated". */
export function networksOf(cards: readonly CardSummary[]): string[] {
  return [...new Set(cards.map((c) => c.network).filter((n): n is string => !!n))].sort();
}
