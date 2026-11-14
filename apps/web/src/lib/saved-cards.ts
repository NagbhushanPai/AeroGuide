/**
 * The checker's card choice, remembered in this browser only (localStorage). Only card product
 * slugs are kept: never card numbers, airports, dates or spend. Works without storage (private
 * windows, blocked site data): the choice then lasts until the page is closed.
 */

export const SAVED_CARDS_KEY = "aeroguide.checker.cards";

type Listener = () => void;

const EMPTY: readonly string[] = Object.freeze([]);
const listeners = new Set<Listener>();
let memory: readonly string[] | null = null; // last known value; also the fallback store
let lastRaw: string | null | undefined;

function readStorage(): string | null | undefined {
  try {
    return window.localStorage.getItem(SAVED_CARDS_KEY);
  } catch {
    return undefined; // storage unavailable
  }
}

function parse(raw: string | null): readonly string[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    const slugs = value.filter(
      (v): v is string => typeof v === "string" && /^[a-z0-9-]{1,120}$/.test(v),
    );
    return Object.freeze([...new Set(slugs)]);
  } catch {
    return EMPTY;
  }
}

/** Stable snapshot for useSyncExternalStore. */
export function getSavedCards(): readonly string[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = readStorage();
  if (raw === undefined) return memory ?? EMPTY;
  if (raw !== lastRaw || memory === null) {
    lastRaw = raw;
    memory = parse(raw);
  }
  return memory;
}

export function getServerSavedCards(): readonly string[] {
  return EMPTY;
}

export function setSavedCards(slugs: readonly string[]): void {
  const next = Object.freeze([...new Set(slugs)]);
  memory = next;
  try {
    if (next.length) window.localStorage.setItem(SAVED_CARDS_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(SAVED_CARDS_KEY);
    lastRaw = readStorage();
  } catch {
    // Storage unavailable: keep the in-memory copy.
  }
  listeners.forEach((l) => l());
}

export function forgetSavedCards(): void {
  setSavedCards([]);
}

export function subscribeSavedCards(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === SAVED_CARDS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
