/**
 * The one wording for missing values, so every page says the same thing. Never use a dash,
 * "Unknown" or an empty cell for a value we don't have.
 */
export const MISSING = {
  /** We have no value (the feed didn't send it, or no open source has it). */
  notAvailable: "Not available",
  /** The source we use was checked and doesn't say. */
  notStated: "Not stated by the source",
} as const;

export type MissingKind = keyof typeof MISSING;
