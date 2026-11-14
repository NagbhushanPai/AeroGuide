"use client";

import { useQuery } from "@tanstack/react-query";

import { useWaking } from "@/hooks/use-waking";
import { contentRetry } from "@/lib/api/retry";
import {
  fetchCard,
  fetchCardLounges,
  fetchCards,
  fetchLounge,
  fetchLounges,
} from "@/lib/api/client";

const STALE_MS = 10 * 60_000;
const retry = contentRetry;

export function useLounges(airport?: string) {
  const result = useQuery({
    queryKey: ["lounges", airport ?? null],
    queryFn: ({ signal }) => fetchLounges(airport, signal),
    staleTime: STALE_MS,
    ...retry,
  });
  return { ...result, waking: useWaking(result.data === undefined && !result.isError) };
}

export function useLounge(slug: string) {
  const result = useQuery({
    queryKey: ["lounge", slug],
    queryFn: ({ signal }) => fetchLounge(slug, signal),
    staleTime: STALE_MS,
    ...retry,
  });
  return { ...result, waking: useWaking(result.data === undefined && !result.isError) };
}

export function useCards() {
  const result = useQuery({
    queryKey: ["cards"],
    queryFn: ({ signal }) => fetchCards(signal),
    staleTime: STALE_MS,
    ...retry,
  });
  return { ...result, waking: useWaking(result.data === undefined && !result.isError) };
}

export function useCard(slug: string) {
  const result = useQuery({
    queryKey: ["card", slug],
    queryFn: ({ signal }) => fetchCard(slug, signal),
    staleTime: STALE_MS,
    ...retry,
  });
  return { ...result, waking: useWaking(result.data === undefined && !result.isError) };
}

/** Departure lounges a card's programmes open. */
export function useCardLounges(slug: string) {
  const result = useQuery({
    queryKey: ["card-lounges", slug],
    queryFn: ({ signal }) => fetchCardLounges(slug, signal),
    staleTime: STALE_MS,
    ...retry,
  });
  return { ...result, waking: useWaking(result.data === undefined && !result.isError) };
}
