/** Display helpers for lounge records. Never invent a value: unknown stays unknown. */

type Period = { days: string[]; open: string; close: string };
export type OpeningHours = { mode: "24h" | "weekly"; periods?: Period[] } | null;

const DAY_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function dayRange(days: string[]): string {
  const sorted = [...days].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b));
  if (sorted.length === 7) return "Daily";
  const idx = sorted.map((d) => WEEK.indexOf(d));
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (consecutive && sorted.length > 2) {
    return `${DAY_LABEL[sorted[0]]}–${DAY_LABEL[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => DAY_LABEL[d] ?? d).join(", ");
}

/** Lines such as "Open 24 hours" or "Mon–Fri 05:00–23:00". Null when hours aren't verified. */
export function formatOpeningHours(hours: OpeningHours): string[] | null {
  if (!hours) return null;
  if (hours.mode === "24h") return ["Open 24 hours"];
  return (hours.periods ?? []).map((p) => {
    const overnight = p.close <= p.open ? " (next day)" : "";
    return `${dayRange(p.days)} ${p.open}–${p.close}${overnight}`;
  });
}

const SCOPE_LABEL = {
  domestic: "Domestic departures",
  international: "International departures",
  both: "Domestic and international",
} as const;

export function scopeLabel(scope: keyof typeof SCOPE_LABEL): string {
  return SCOPE_LABEL[scope];
}

const ENTRY_LABEL: Record<string, string> = {
  card_swipe: "Swipe the card at the lounge",
  programme_card: "Show the programme membership card",
  app_pass: "Show a pass from the programme's app",
  voucher: "Use a voucher",
  other: "See the bank's terms",
};

export function entryLabel(method: string): string {
  return ENTRY_LABEL[method] ?? method;
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}
