import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  /** "h1" when the empty state is the whole page (not found). */
  as?: "h1" | "h2";
};

/** Honest placeholder for content that doesn't exist yet. Never filled with fake data. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  as: Heading = "h2",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-muted text-primary">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <Heading className="text-lg font-semibold">{title}</Heading>
      <div className="mt-2 max-w-md text-sm text-muted-foreground">{description}</div>
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
