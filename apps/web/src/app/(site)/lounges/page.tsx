import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoungeDirectory } from "@/components/lounges/lounge-list";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Lounges",
  description: "Airport lounges in India: where they are, when they open and how to get in.",
};

export default function LoungesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <PageHeader
        title="Lounges"
        description="Where each lounge is, when it opens and which programmes it accepts, from the lounge operator's own pages."
      />
      {/* Filters (?airport=, ?q=, …) are read from the URL, known only at request time. */}
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <LoungeDirectory />
      </Suspense>
    </div>
  );
}
