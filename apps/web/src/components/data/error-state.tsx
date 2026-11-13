"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type ErrorStateProps = {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
};

/** Shown when data failed to load. Never shows an empty list that looks like "no results". */
export function ErrorState({
  title = "Couldn't load this",
  description = "The data service didn't respond. Try again in a moment.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-12 text-center"
    >
      <TriangleAlert aria-hidden="true" className="mb-3 size-6 text-destructive" />
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-1 max-w-md text-sm text-muted-foreground">{description}</div>
      {onRetry ? (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
