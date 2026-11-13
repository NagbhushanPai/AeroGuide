import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Explicit "Not available": never an empty string, a dash pretending to be data, or a zero. */
export function NotAvailable({ reason }: { reason?: string }) {
  return (
    <span className="text-muted-foreground italic" title={reason}>
      Not available
      {reason ? <span className="sr-only">: {reason}</span> : null}
    </span>
  );
}

type FieldProps = {
  label: string;
  /** null, undefined and "" render as Not available. 0 is a real value and is shown. */
  value: ReactNode;
  /** Why the value is missing, for example "Not available from open data sources". */
  missingReason?: string;
  mono?: boolean;
  className?: string;
};

/** A label/value pair for use inside a <dl>. */
export function Field({ label, value, missingReason, mono, className }: FieldProps) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", mono && "font-mono tabular-nums")}>
        {missing ? <NotAvailable reason={missingReason} /> : value}
      </dd>
    </div>
  );
}
