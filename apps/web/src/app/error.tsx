"use client";

import { ErrorState } from "@/components/data/error-state";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-16">
      <ErrorState
        title="Something went wrong"
        description="This page couldn't be loaded. Try again in a moment."
        onRetry={reset}
      />
    </main>
  );
}
