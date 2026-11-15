import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shown whenever simulated data is on screen (ADR-0011). Deliberately loud and always labelled
 * in text, so demo data can't be mistaken for live data.
 */
export function DemoBadge({
  className,
  note,
}: {
  className?: string;
  /** Shown after "Demo data" in the badge itself, e.g. "not real fares". */
  note?: string;
}) {
  return (
    <span
      role="status"
      className={cn(
        // Fixed amber (not the theme token) so contrast with the dark text holds in both themes.
        "inline-flex items-center gap-1.5 rounded-md border-2 border-amber-500 bg-amber-300 px-2 py-0.5",
        "font-mono text-xs font-bold tracking-wider text-neutral-950 uppercase",
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="size-3.5" />
      {/* One text node, so the flex gap doesn't split "Demo data: …". */}
      <span>{note ? `Demo data: ${note}` : "Demo data"}</span>
      {note ? null : <span className="sr-only">: simulated aircraft, not real flights</span>}
    </span>
  );
}
