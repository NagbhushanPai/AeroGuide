import type { Metadata } from "next";
import { Suspense } from "react";

import { CardDirectory } from "@/components/cards/card-directory";
import { LoungeChecker } from "@/components/cards/lounge-checker";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/layout/section";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Cards",
  description:
    "Credit-card lounge benefits in India, with versions and sources, and a lounge access checker.",
};

export default function CardsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <PageHeader
        title="Cards and lounge access"
        description="Lounge benefits read from each bank's own pages, with the date they apply from, and a checker that explains every answer."
      />
      {/* The checker reads ?airport= and ?card= from the URL, known only at request time. */}
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <LoungeChecker />
      </Suspense>
      <Section id="cards" title="Cards by issuer" className="mt-6 border-t">
        <CardDirectory />
      </Section>
    </div>
  );
}
