"use client";

import { BookOpen, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { WakingMessage } from "@/components/data/waking-message";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { REGIONS, type AirportSummary, type Region } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import { useAirportSearch } from "./use-airports";

/** Every airport in one request: there are about 120, and the API allows up to 200. */
const LIMIT = 200;
const DEBOUNCE_MS = 250;

function isRegion(value: string | null): value is Region {
  return value !== null && (REGIONS as readonly string[]).includes(value);
}

export function AirportDirectory() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const urlQ = params.get("q") ?? "";
  const urlRegion = params.get("region");
  const region = isRegion(urlRegion) ? urlRegion : null;
  const guidesOnly = params.get("guides") === "1";

  const [text, setText] = useState(urlQ);
  // Follow the URL when it changes from outside (back/forward, a link to /airports), but not
  // when it's just catching up with what was typed: that would undo keystrokes made since.
  const [seenQ, setSeenQ] = useState(urlQ);
  const [pushedQ, setPushedQ] = useState(urlQ);
  if (urlQ !== seenQ) {
    setSeenQ(urlQ);
    if (urlQ !== pushedQ) {
      setText(urlQ);
      setPushedQ(urlQ);
    }
  }

  // The URL holds the filters (so results can be shared); typing reaches it after a pause.
  function update(next: { q?: string; region?: Region | null; guides?: boolean }) {
    const sp = new URLSearchParams(params.toString());
    const set = (key: string, value: string | null) =>
      value ? sp.set(key, value) : sp.delete(key);
    if ("q" in next) {
      set("q", next.q || null);
      setPushedQ(next.q ?? "");
    }
    if ("region" in next) set("region", next.region ?? null);
    if ("guides" in next) set("guides", next.guides ? "1" : null);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== urlQ) update({ q: text.trim() });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // Only typing starts the timer; URL changes it causes must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const search = useAirportSearch({ q: urlQ, region, guidesOnly, limit: LIMIT });
  const data = search.data;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="relative block max-w-xl">
          <span className="sr-only">Search airports</span>
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Airport name, city, state or code (DEL, VOBL…)"
            className="h-11 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by region"
        >
          <Chip pressed={region === null} onClick={() => update({ region: null })}>
            All regions
          </Chip>
          {REGIONS.map((r) => (
            <Chip key={r} pressed={region === r} onClick={() => update({ region: r })}>
              {r}
            </Chip>
          ))}
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <Chip pressed={guidesOnly} onClick={() => update({ guides: !guidesOnly })}>
            <BookOpen aria-hidden="true" className="size-3.5" /> With guides
          </Chip>
        </div>
      </div>

      {search.isError && !data ? (
        <ErrorState
          title="Couldn't load airports"
          description="The airport service didn't respond. It may still be starting up."
          onRetry={() => void search.refetch()}
        />
      ) : !data ? (
        <div aria-busy="true" className="space-y-3">
          {search.waking ? (
            <WakingMessage />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Loading airports…
            </p>
          )}
          <AirportGridSkeleton />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No airports match"
          description="Try a city, a state or a three-letter code. Only Indian airports with scheduled passenger service are listed."
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {data.total.toLocaleString("en-IN")} airport{data.total === 1 ? "" : "s"}
            {search.isFetching ? " · updating…" : ""}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((a) => (
              <li key={a.iata}>
                <AirportCard airport={a} />
              </li>
            ))}
          </ul>
          {data.total > data.items.length ? (
            <p className="text-sm text-muted-foreground">
              Showing the first {data.items.length.toLocaleString("en-IN")} of{" "}
              {data.total.toLocaleString("en-IN")}. Search or pick a region to narrow the list.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        pressed
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function AirportCard({ airport: a }: { airport: AirportSummary }) {
  const place = [a.city, a.state].filter(Boolean).join(", ");
  return (
    <Link
      href={`/airports/${a.iata}`}
      className="group flex h-full items-start gap-3 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="font-mono text-lg font-semibold text-primary tabular-nums">{a.iata}</span>
      <span className="min-w-0 flex-1">
        <span className="block leading-snug font-medium group-hover:underline">{a.name}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {place || "City not recorded"}
          <span aria-hidden="true"> · </span>
          {a.region}
        </span>
        {a.has_guide ? (
          <Badge variant="outline" className="mt-2">
            <BookOpen aria-hidden="true" /> Guide
          </Badge>
        ) : null}
      </span>
    </Link>
  );
}

/** The card grid placeholder, shared by the loading state and the page's Suspense fallback. */
export function AirportGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

/**
 * Shown while the directory waits for the URL (its filters live there). Same shape as the
 * directory's own loading state, so the page doesn't flash between two skeletons.
 */
export function AirportDirectorySkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-11 max-w-xl rounded-lg" />
        <Skeleton className="h-8 max-w-2xl rounded-full" />
      </div>
      <div className="space-y-3">
        <p role="status" className="text-sm text-muted-foreground">
          Loading airports…
        </p>
        <AirportGridSkeleton />
      </div>
    </div>
  );
}
