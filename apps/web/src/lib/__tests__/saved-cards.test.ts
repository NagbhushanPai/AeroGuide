import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forgetSavedCards,
  getSavedCards,
  SAVED_CARDS_KEY,
  setSavedCards,
  subscribeSavedCards,
} from "../saved-cards";

afterEach(() => {
  vi.restoreAllMocks();
  forgetSavedCards();
  localStorage.clear();
});

describe("saved cards", () => {
  it("stores only card slugs, and forgets them", () => {
    setSavedCards(["test-card", "test-card", "other-card"]);
    expect(localStorage.getItem(SAVED_CARDS_KEY)).toBe('["test-card","other-card"]');
    expect(getSavedCards()).toEqual(["test-card", "other-card"]);
    forgetSavedCards();
    expect(localStorage.getItem(SAVED_CARDS_KEY)).toBeNull();
    expect(getSavedCards()).toEqual([]);
  });

  it("returns a stable snapshot", () => {
    setSavedCards(["a"]);
    expect(getSavedCards()).toBe(getSavedCards());
  });

  it("ignores junk in storage", () => {
    localStorage.setItem(SAVED_CARDS_KEY, '{"not":"a list"}');
    expect(getSavedCards()).toEqual([]);
    localStorage.setItem(SAVED_CARDS_KEY, '["ok-card", 3, "<script>"]');
    expect(getSavedCards()).toEqual(["ok-card"]);
  });

  it("works when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const listener = vi.fn();
    const unsubscribe = subscribeSavedCards(listener);
    setSavedCards(["in-memory"]);
    expect(getSavedCards()).toEqual(["in-memory"]);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
