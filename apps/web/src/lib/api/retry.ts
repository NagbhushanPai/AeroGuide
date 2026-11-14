/**
 * Retry policy for content requests. The free-tier API can take up to a minute to wake, so
 * retries keep going for about 75 s (2, 4, 8, 15, 15, 15, 15 s) before an error is shown.
 * 404s are answers, not failures, and are never retried.
 */
export const contentRetry = {
  retry: (failures: number, error: unknown) => {
    if (
      error instanceof Error &&
      "status" in error &&
      (error as { status?: number }).status === 404
    )
      return false;
    return failures < 7;
  },
  retryDelay: (attempt: number) => Math.min(2_000 * 2 ** attempt, 15_000),
};
