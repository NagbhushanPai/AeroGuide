"use client";

import { StaleIndicator } from "@/components/data/stale-indicator";
import { useNow } from "@/hooks/use-now";

/** Example timestamps relative to the viewer's clock (client-only, so it doesn't block prerender). */
export function StaleExamples() {
  const now = useNow();
  if (now === null) return <p className="text-xs text-muted-foreground">Loading examples…</p>;
  const ago = (s: number) => new Date(now - s * 1000).toISOString();
  return (
    <ul className="space-y-2">
      <li>
        <StaleIndicator observedAt={ago(12)} />
      </li>
      <li>
        <StaleIndicator observedAt={ago(140)} />
      </li>
      <li>
        <StaleIndicator observedAt={ago(900)} />
      </li>
    </ul>
  );
}
