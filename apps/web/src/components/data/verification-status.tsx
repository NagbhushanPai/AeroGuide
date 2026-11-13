import { CircleCheck, CircleHelp, CircleSlash, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatIstDate, type VerificationState } from "@/lib/freshness";

const STATES: Record<VerificationState, { label: string; icon: LucideIcon; className: string }> = {
  verified: {
    label: "Verified",
    icon: CircleCheck,
    className: "border-success/40 bg-success/10 text-success",
  },
  outdated: {
    label: "May be outdated",
    icon: Clock,
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  unverified: {
    label: "Not yet verified",
    icon: CircleHelp,
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  unavailable: {
    label: "Not available",
    icon: CircleSlash,
    className: "border-border bg-muted text-muted-foreground",
  },
};

type VerificationStatusProps = {
  status: VerificationState;
  /** ISO date the record was last checked against its source. */
  verifiedAt?: string | null;
  className?: string;
};

/** Verification label with icon and text, so meaning never depends on colour alone. */
export function VerificationStatus({ status, verifiedAt, className }: VerificationStatusProps) {
  const { label, icon: Icon, className: tone } = STATES[status];
  const checked = verifiedAt ? `checked ${formatIstDate(verifiedAt)}` : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span>
        {label}
        {checked && status !== "unavailable" ? (
          <span className="font-normal"> · {checked}</span>
        ) : null}
      </span>
    </span>
  );
}
