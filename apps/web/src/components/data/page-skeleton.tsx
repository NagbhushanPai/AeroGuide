import { Skeleton } from "@/components/ui/skeleton";

/** Generic loading layout: a title, a line of description and a grid of cards. */
export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
