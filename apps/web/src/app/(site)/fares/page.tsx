import type { Metadata } from "next";
import { Suspense } from "react";

import { FareSearch } from "@/components/fares/fare-search";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Flight fares",
  description:
    "Compare fares on domestic flights within India: prices from several sellers side by side, with stops, times and durations.",
};

export default function FaresPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <PageHeader
        title="Flight fares"
        description="Compare fares on domestic routes in India. Prices change often; the seller confirms the final price when you book."
      />
      {/* The form reads its route, dates, passengers and cabin from the URL: known only at
          request time. */}
      <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
        <FareSearch />
      </Suspense>
    </div>
  );
}
