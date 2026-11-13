import type { Metadata } from "next";
import { Suspense } from "react";

import { CardGuide } from "@/components/cards/card-guide";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Card" };

async function Guide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CardGuide slug={slug.toLowerCase()} />;
}

export default function CardPage({ params }: PageProps<"/cards/[slug]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
        <Guide params={params} />
      </Suspense>
    </div>
  );
}
