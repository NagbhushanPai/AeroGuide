import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

import { RelativeTime } from "./relative-time";

type SourceBadgeProps = {
  name: string;
  url?: string | null;
  /** ISO timestamp the data was fetched or last updated. */
  updatedAt?: string | null;
  className?: string;
};

/** "Source: adsb.lol · updated 12 s ago". Required wherever changeable data is shown. */
export function SourceBadge({ name, url, updatedAt, className }: SourceBadgeProps) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <span>Source: </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline"
        >
          {name}
          <ExternalLink aria-hidden="true" className="size-3" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span>{name}</span>
      )}
      {updatedAt ? (
        <>
          <span aria-hidden="true"> · </span>
          <span>
            updated <RelativeTime iso={updatedAt} />
          </span>
        </>
      ) : null}
    </p>
  );
}
