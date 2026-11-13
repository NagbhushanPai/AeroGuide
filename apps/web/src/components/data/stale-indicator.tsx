"use client";

import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { ageSeconds, formatAge, formatIst, liveFreshness, type Freshness } from "@/lib/freshness";

const TONE: Record<Freshness, { dot: string; label: string }> = {
  fresh: { dot: "bg-success", label: "Live" },
  stale: { dot: "bg-warning", label: "Delayed" },
  expired: { dot: "bg-muted-foreground", label: "No recent data" },
};

/** Live-data freshness: Live (< 90 s), Delayed (< 5 min) or No recent data. */
export function StaleIndicator({
  observedAt,
  className,
}: {
  observedAt: string;
  className?: string;
}) {
  const now = useNow();

  if (now === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Last seen <time dateTime={observedAt}>{formatIst(observedAt)}</time>
      </span>
    );
  }

  const age = ageSeconds(observedAt, new Date(now));
  const state = liveFreshness(age);
  const { dot, label } = TONE[state];

  return (
    <span
      data-freshness={state}
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
      <span className="font-medium text-foreground">{label}</span>
      <span>
        · {state === "fresh" ? "" : "last seen "}
        <time dateTime={observedAt} title={formatIst(observedAt)}>
          {formatAge(age)}
        </time>
      </span>
    </span>
  );
}
