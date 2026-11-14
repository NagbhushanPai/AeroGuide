"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/data/error-state";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-16">
      <ErrorState
        as="h1"
        title="Something went wrong"
        description="This page couldn't be loaded. Try again in a moment."
        onRetry={reset}
      >
        {error.digest ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </ErrorState>
    </main>
  );
}
