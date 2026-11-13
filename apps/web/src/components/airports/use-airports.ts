"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useWaking } from "@/hooks/use-waking";
import { fetchAirport, fetchAirports, type AirportQuery } from "@/lib/api/client";

// Airport content only changes when the seed runs, so long client caching is fine.
const STALE_MS = 10 * 60_000;
const retry = { retry: 3, retryDelay: (n: number) => Math.min(2_000 * 2 ** n, 15_000) };

export function useAirportSearch(query: AirportQuery) {
  const result = useQuery({
    queryKey: ["airports", query],
    queryFn: ({ signal }) => fetchAirports(query, signal),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
    ...retry,
  });
  return { ...result, waking: useWaking(result.data === undefined && !result.isError) };
}

export function useAirport(code: string) {
  const result = useQuery({
    queryKey: ["airport", code],
    queryFn: ({ signal }) => fetchAirport(code, signal),
    staleTime: STALE_MS,
    ...retry,
  });
  return { ...result, waking: useWaking(result.data === undefined && !result.isError) };
}
