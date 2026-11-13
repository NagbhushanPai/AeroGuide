"use client";

import { useNow } from "@/hooks/use-now";
import { ageSeconds, formatAge, formatIst } from "@/lib/freshness";

/**
 * "12 min ago" with the exact IST time as a tooltip. Renders the absolute time until the
 * client clock is available, so server and client markup match.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const now = useNow();
  const absolute = formatIst(iso);
  return (
    <time dateTime={iso} title={absolute}>
      {now === null ? absolute : formatAge(ageSeconds(iso, new Date(now)))}
    </time>
  );
}
