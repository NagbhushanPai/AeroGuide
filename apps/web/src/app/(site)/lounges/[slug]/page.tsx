import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { JsonLd } from "@/components/data/json-ld";
import { LoungeGuide } from "@/components/lounges/lounge-guide";
import { getAllLounges, getLounge, settle } from "@/lib/api/server";
import { loungeDescription, loungeJsonLd, loungeTitle, pageMetadata } from "@/lib/seo";

// Fully static, with a real 404 for unknown slugs: see app/(site)/airports/[code]/page.tsx.
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  try {
    const lounges = await getAllLounges();
    if (lounges.length) return lounges.map((l) => ({ slug: l.slug }));
  } catch {
    // API asleep or down during the build: pages are rendered on first visit instead.
  }
  return [{ slug: "unknown" }];
}

export async function generateMetadata({
  params,
}: PageProps<"/lounges/[slug]">): Promise<Metadata> {
  const slug = (await params).slug.toLowerCase();
  const lounge = await settle(getLounge(slug));
  if (lounge === null) return { title: "Lounge not found" };
  if (lounge === "unavailable") {
    return pageMetadata({
      title: "Lounge",
      description: "Where the lounge is, when it opens and which programmes and cards get you in.",
      path: `/lounges/${slug}`,
    });
  }
  return pageMetadata({
    title: loungeTitle(lounge),
    description: loungeDescription(lounge),
    path: `/lounges/${lounge.slug}`,
  });
}

export default async function LoungePage({ params }: PageProps<"/lounges/[slug]">) {
  const { slug: raw } = await params;
  const slug = raw.toLowerCase();
  if (raw !== slug) permanentRedirect(`/lounges/${encodeURIComponent(slug)}`);

  const lounge = await settle(getLounge(slug));
  if (lounge === null) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {lounge !== "unavailable" ? <JsonLd data={loungeJsonLd(lounge)} /> : null}
      <LoungeGuide slug={slug} />
    </div>
  );
}
