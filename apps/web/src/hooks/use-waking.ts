"use client";

import { useEffect, useState } from "react";

/** After this long without a first response, assume the free-tier API is cold-starting. */
export const WAKING_AFTER_MS = 4_000;

/** True once `waiting` has stayed true for WAKING_AFTER_MS (shown as "waking the server"). */
export function useWaking(waiting: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setSlow(true), WAKING_AFTER_MS);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [waiting]);
  return waiting && slow;
}
