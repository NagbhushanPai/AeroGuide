"use client";

import { useNow } from "@/hooks/use-now";
import type { PositionsMeta } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import { DemoBadge } from "@/components/data/demo-badge";
import { RelativeTime } from "@/components/data/relative-time";

type Props = { meta: PositionsMeta | undefined; loading: boolean; waking: boolean; error: boolean };

const TONE = {
  live: { dot: "bg-success animate-pulse", text: "Live" },
  degraded: { dot: "bg-warning", text: "Delayed" },
  unavailable: { dot: "bg-muted-foreground", text: "Unavailable" },
  demo: { dot: "bg-warning", text: "Demo" },
} as const;

/** Live/Delayed/Unavailable/Demo, aircraft count, source and last update. */
export function LiveStatus({ meta, loading, waking, error }: Props) {
  if (!meta) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {error
          ? "Live data service unreachable. Retrying…"
          : waking
            ? "Waking up the live data service… this can take up to a minute."
            : loading
              ? "Loading live traffic…"
              : null}
      </p>
    );
  }
  const tone = TONE[meta.mode];
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {meta.mode === "demo" ? (
        <DemoBadge />
      ) : (
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span aria-hidden="true" className={cn("size-2 rounded-full", tone.dot)} />
          {tone.text}
          {meta.mode !== "unavailable" ? (
            <span className="font-mono tabular-nums">
              · {meta.count.toLocaleString("en-IN")} aircraft
            </span>
          ) : null}
        </span>
      )}
      {meta.source && meta.fetched_at ? (
        <span className="text-muted-foreground">
          {meta.source_url ? (
            <a
              href={meta.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline"
            >
              {meta.source}
            </a>
          ) : (
            meta.source
          )}{" "}
          · updated <RelativeTime iso={meta.fetched_at} />
        </span>
      ) : null}
      {meta.message && meta.mode !== "demo" ? (
        <span className="text-warning">{meta.message}</span>
      ) : null}
    </div>
  );
}

/** Current time in IST (minute resolution), client-only to keep prerendering deterministic. */
export function IstClock() {
  const now = useNow();
  if (now === null) return null;
  const time = new Date(now).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
  return (
    <time dateTime={new Date(now).toISOString()} className="font-mono text-sm tabular-nums">
      {time} <span className="text-xs text-muted-foreground">IST</span>
    </time>
  );
}
