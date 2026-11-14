"use client";

import { useNow } from "@/hooks/use-now";
import type { PositionsMeta } from "@/lib/api/client";
import { formatAge } from "@/lib/freshness";
import { cn } from "@/lib/utils";

import { DemoBadge } from "@/components/data/demo-badge";
import { RelativeTime } from "@/components/data/relative-time";
import { WakingMessage } from "@/components/data/waking-message";

import type { LiveState } from "./live-state";

type Props = { meta: PositionsMeta | undefined; state: LiveState };

function updated(ageS: number | null) {
  return ageS === null ? null : `updated ${formatAge(ageS)}`;
}

/** Live / Delayed / No recent data / Unavailable / Demo, with count, source and last update. */
export function LiveStatus({ meta, state }: Props) {
  if (state.kind === "waking") return <WakingMessage className="text-xs" />;
  if (state.kind === "loading" || state.kind === "unreachable") {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {state.kind === "unreachable"
          ? "Live data service unreachable. Retrying…"
          : "Loading live traffic…"}
      </p>
    );
  }
  if (!meta) return null;

  const label =
    state.kind === "live"
      ? { dot: "bg-success motion-safe:animate-pulse", text: "Live", detail: null }
      : state.kind === "delayed"
        ? { dot: "bg-warning", text: "Delayed", detail: updated(state.ageS) }
        : state.kind === "expired"
          ? { dot: "bg-muted-foreground", text: "No recent data", detail: updated(state.ageS) }
          : state.kind === "unavailable"
            ? { dot: "bg-muted-foreground", text: "Unavailable", detail: null }
            : null; // demo

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {label === null ? (
        <DemoBadge />
      ) : (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 font-medium">
          <span aria-hidden="true" className={cn("size-2 rounded-full", label.dot)} />
          <span>{label.text}</span>
          {label.detail ? <span className="font-normal">· {label.detail}</span> : null}
          {state.kind !== "unavailable" ? (
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
          )}
          {/* The delayed/expired label already says how old the data is. */}
          {state.kind === "live" || state.kind === "demo" ? (
            <>
              {" "}
              · updated <RelativeTime iso={meta.fetched_at} />
            </>
          ) : null}
        </span>
      ) : null}
      {meta.message && state.kind !== "demo" ? (
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
