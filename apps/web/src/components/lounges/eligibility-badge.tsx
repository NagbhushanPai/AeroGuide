import { CircleCheck, CircleHelp, CircleX, type LucideIcon } from "lucide-react";

import type { EligibilityStatus } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const STATES: Record<EligibilityStatus, { label: string; icon: LucideIcon; tone: string }> = {
  yes: {
    label: "Likely yes",
    icon: CircleCheck,
    tone: "border-success/40 bg-success/10 text-success",
  },
  no: {
    label: "No",
    icon: CircleX,
    tone: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  depends: {
    label: "Depends",
    icon: CircleHelp,
    tone: "border-warning/40 bg-warning/10 text-warning",
  },
};

/** Icon and text, so the answer never depends on colour alone. */
export function EligibilityBadge({
  status,
  className,
}: {
  status: EligibilityStatus;
  className?: string;
}) {
  const { label, icon: Icon, tone } = STATES[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
