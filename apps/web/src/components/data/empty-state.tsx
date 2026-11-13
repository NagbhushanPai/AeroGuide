import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  children?: ReactNode;
};

/** Honest placeholder for content that doesn't exist yet. Never filled with fake data. */
export function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-muted text-primary">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 max-w-md text-sm text-muted-foreground">{description}</div>
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
