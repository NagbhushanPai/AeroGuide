"use client";

import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description="The page couldn't be loaded. Try again in a moment."
      >
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </EmptyState>
    </div>
  );
}
