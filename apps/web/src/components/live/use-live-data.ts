"use client";

import { useQuery } from "@tanstack/react-query";

import { useWaking } from "@/hooks/use-waking";
import { fetchAircraft, fetchPositions } from "@/lib/api/client";
import { contentRetry } from "@/lib/api/retry";

export const POLL_MS = 15_000;

export function usePositions() {
  const query = useQuery({
    queryKey: ["positions"],
    queryFn: ({ signal }) => fetchPositions(signal),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false, // pause while the tab is hidden
    staleTime: POLL_MS - 1_000,
    // Keep retrying through a free-tier cold start before showing an error. Later polls
    // that fail keep the last data on screen, and the status label says it's delayed.
    ...contentRetry,
  });
  const waking = useWaking(query.data === undefined && !query.isError);
  return { ...query, waking };
}

/**
 * Details for one aircraft. Pass null to stop polling (nothing selected, or the aircraft has
 * left the feed and the API would only answer 404).
 */
export function useAircraft(icao24: string | null) {
  return useQuery({
    queryKey: ["aircraft", icao24],
    queryFn: ({ signal }) => fetchAircraft(icao24!, signal),
    enabled: icao24 !== null,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
}
