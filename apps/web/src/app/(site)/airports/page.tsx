import type { Metadata } from "next";
import { Suspense } from "react";

import { AirportDirectory } from "@/components/airports/airport-directory";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Airports",
  description: "Indian airports with scheduled passenger service: codes, locations and guides.",
};

export default function AirportsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <PageHeader
        title="Airports"
        description={
          <>
            Indian airports with scheduled passenger service. Codes and locations come from
            OurAirports (public domain) and haven&apos;t yet been cross-checked against AIP India.
            Guides add terminals and airlines, each checked against an official source.
          </>
        }
      />
      {/* The directory reads its filters from the URL, which is only known at request time. */}
      <Suspense fallback={<Skeleton className="h-11 max-w-xl rounded-lg" />}>
        <AirportDirectory />
      </Suspense>
    </div>
  );
}
