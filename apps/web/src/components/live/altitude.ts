/**
 * Aircraft colour by altitude: ground, then low to cruise. Shared by the map layer and its
 * legend. Colour is never the only signal: altitude is also shown as text.
 */
export const GROUND_COLOR = "#8b95a7";

export const ALTITUDE_STOPS: readonly { ft: number; color: string }[] = [
  { ft: 0, color: "#f59e0b" },
  { ft: 10000, color: "#facc15" },
  { ft: 20000, color: "#34d399" },
  { ft: 30000, color: "#38bdf8" },
  { ft: 40000, color: "#a78bfa" },
];
