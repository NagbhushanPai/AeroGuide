import type { Metadata } from "next";
import { Suspense } from "react";

import {
  AirportDirectory,
  AirportDirectorySkeleton,
} from "@/components/airports/airport-directory";
import { PageHeader } from "@/components/layout/page-header";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Airports",
  description: "Indian airports with scheduled passenger service: codes, locations and guides.",
  path: "/airports",
});

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
      {/*
        The directory reads its filters from the URL, which is only known at request time.
        The fallback has the same shape as the directory's own loading state (one skeleton).
      */}
      <Suspense fallback={<AirportDirectorySkeleton />}>
        <AirportDirectory />
      </Suspense>
    </div>
  );
}
