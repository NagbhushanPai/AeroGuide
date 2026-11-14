import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** The one message shown while the free-tier data server wakes up. */
export const WAKING_TEXT =
  "Waking the data server. On the free tier this can take up to a minute; this page will fill in on its own.";

export function WakingMessage({ className }: { className?: string }) {
  return (
    <p
      role="status"
      className={cn("flex items-start gap-2 text-sm text-muted-foreground", className)}
    >
      <Loader2
        aria-hidden
        className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none"
      />
      <span>{WAKING_TEXT}</span>
    </p>
  );
}
