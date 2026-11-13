import { ExternalLink } from "lucide-react";

import { VerificationStatus } from "@/components/data/verification-status";
import type { Provenance } from "@/lib/api/client";
import { formatIstDate } from "@/lib/freshness";
import { cn } from "@/lib/utils";

/** Status, source and notes for one sourced record (ADR-0006). */
export function ProvenanceLine({
  provenance,
  className,
}: {
  provenance: Provenance;
  className?: string;
}) {
  const { status, verified_at, reverify_due, source, notes } = provenance;
  return (
    <div className={cn("space-y-1 text-xs text-muted-foreground", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <VerificationStatus status={status} verifiedAt={verified_at} />
        {source ? (
          <span>
            Source:{" "}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline"
            >
              {source.name}
              <ExternalLink aria-hidden="true" className="size-3" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span aria-hidden="true"> · </span>
            retrieved {formatIstDate(source.retrieved_at)}
          </span>
        ) : (
          <span>No source recorded</span>
        )}
        {reverify_due && status === "verified" ? (
          <span>Re-check due {formatIstDate(reverify_due)}</span>
        ) : null}
      </div>
      {notes ? <p>{notes}</p> : null}
    </div>
  );
}
