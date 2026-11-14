import type { ReactNode } from "react";

import { MISSING, type MissingKind } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * Explicit "Not available" (or "Not stated by the source"): never an empty string, a dash
 * pretending to be data, or a zero.
 */
export function NotAvailable({
  reason,
  kind = "notAvailable",
  className,
}: {
  reason?: string;
  kind?: MissingKind;
  className?: string;
}) {
  return (
    <span className={cn("text-muted-foreground italic", className)} title={reason}>
      {MISSING[kind]}
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
  /** "notStated" when the source was checked and says nothing. */
  missing?: MissingKind;
  mono?: boolean;
  className?: string;
};

/** A label/value pair for use inside a <dl>. */
export function Field({ label, value, missingReason, missing, mono, className }: FieldProps) {
  const isMissing = value === null || value === undefined || value === "";
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", mono && "font-mono tabular-nums")}>
        {isMissing ? <NotAvailable reason={missingReason} kind={missing} /> : value}
      </dd>
    </div>
  );
}
