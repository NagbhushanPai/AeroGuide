"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchAircraft, fetchPositions } from "@/lib/api/client";

export const POLL_MS = 15_000;
/** After this long without a first response, assume the free-tier API is cold-starting. */
const WAKING_AFTER_MS = 4_000;

export function usePositions() {
  const query = useQuery({
    queryKey: ["positions"],
    queryFn: ({ signal }) => fetchPositions(signal),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false, // pause while the tab is hidden
    staleTime: POLL_MS - 1_000,
    retry: 3,
    retryDelay: (n) => Math.min(2_000 * 2 ** n, 15_000),
  });

  const [slow, setSlow] = useState(false);
  const waitingForFirst = query.data === undefined && !query.isError;
  useEffect(() => {
    if (!waitingForFirst) return;
    const t = setTimeout(() => setSlow(true), WAKING_AFTER_MS);
    return () => clearTimeout(t);
  }, [waitingForFirst]);

  return { ...query, waking: waitingForFirst && slow };
}

export function useAircraft(icao24: string | null) {
  return useQuery({
    queryKey: ["aircraft", icao24],
    queryFn: ({ signal }) => fetchAircraft(icao24!, signal),
    enabled: icao24 !== null,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
}
