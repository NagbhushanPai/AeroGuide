import type { Metadata } from "next";
import { Suspense } from "react";

import { AirportGuide } from "@/components/airports/airport-guide";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Airport guide" };

async function Guide({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <AirportGuide code={code.toUpperCase()} />;
}

export default function AirportPage({ params }: PageProps<"/airports/[code]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
        <Guide params={params} />
      </Suspense>
    </div>
  );
}
