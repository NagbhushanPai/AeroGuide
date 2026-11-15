"use client";

import { ChevronDown, Minus, Plus } from "lucide-react";
import { Popover } from "radix-ui";
import { useId } from "react";

import type { Passengers } from "@/lib/api/client";
import { MAX_PASSENGERS, passengerCount, passengersLabel } from "@/lib/fares";
import { cn } from "@/lib/utils";

type Kind = keyof Passengers;

const ROWS: readonly { key: Kind; label: string; help: string; one: string; many: string }[] = [
  { key: "adults", label: "Adults", help: "12 years and over", one: "adult", many: "adults" },
  { key: "children", label: "Children", help: "2 to 11 years", one: "child", many: "children" },
  {
    key: "infants_in_seat",
    label: "Infants in a seat",
    help: "Under 2, with their own seat",
    one: "infant in a seat",
    many: "infants in a seat",
  },
  {
    key: "infants_on_lap",
    label: "Infants on a lap",
    help: "Under 2, on an adult's lap",
    one: "infant on a lap",
    many: "infants on a lap",
  },
];

/** Passenger counts in a small popover with − / + steppers. */
export function PassengersPicker({
  value,
  onChange,
  error,
}: {
  value: Passengers;
  onChange: (next: Passengers) => void;
  error: string | null;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const errorId = `${id}-error`;
  const total = passengerCount(value);

  function canAdd(key: Kind): boolean {
    if (total >= MAX_PASSENGERS) return false;
    if (key === "infants_on_lap") return value.infants_on_lap < value.adults;
    return true;
  }
  const min = (key: Kind) => (key === "adults" ? 1 : 0);

  return (
    <div className="min-w-0">
      <span id={labelId} className="mb-1 block text-sm font-medium">
        Passengers
      </span>
      <Popover.Root>
        <Popover.Trigger
          type="button"
          aria-labelledby={`${labelId} ${valueId}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive sm:text-sm"
        >
          <span id={valueId} className="min-w-0 truncate">
            {passengersLabel(value)}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            aria-label="Passengers"
            className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
          >
            <ul className="space-y-2">
              {ROWS.map((row) => {
                const n = value[row.key];
                const rowId = `${id}-${row.key}`;
                return (
                  <li
                    key={row.key}
                    role="group"
                    aria-labelledby={`${rowId}-label`}
                    className="flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p id={`${rowId}-label`} className="text-sm font-medium">
                        {row.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{row.help}</p>
                    </div>
                    <StepButton
                      label={`Remove one: ${row.many}`}
                      disabled={n <= min(row.key)}
                      onClick={() => onChange({ ...value, [row.key]: n - 1 })}
                    >
                      <Minus aria-hidden="true" className="size-4" />
                    </StepButton>
                    <output
                      aria-live="polite"
                      aria-label={`${n} ${n === 1 ? row.one : row.many}`}
                      className="w-5 text-center font-medium tabular-nums"
                    >
                      {n}
                    </output>
                    <StepButton
                      label={`Add one: ${row.many}`}
                      disabled={!canAdd(row.key)}
                      onClick={() => onChange({ ...value, [row.key]: n + 1 })}
                    >
                      <Plus aria-hidden="true" className="size-4" />
                    </StepButton>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Up to {MAX_PASSENGERS} passengers per search. Each infant on a lap needs an adult.
            </p>
            {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
            <Popover.Close className="mt-3 h-9 w-full rounded-md border bg-background text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
              Done
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {error ? (
        <span id={errorId} className="mt-1 block text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      // aria-disabled rather than disabled, so focus stays on the button at a limit.
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick();
      }}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border bg-background outline-none",
        "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-background",
      )}
    >
      {children}
    </button>
  );
}
