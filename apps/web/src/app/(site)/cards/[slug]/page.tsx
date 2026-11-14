import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { CardGuide } from "@/components/cards/card-guide";
import { JsonLd } from "@/components/data/json-ld";
import { getAllCards, getCard, settle } from "@/lib/api/server";
import { cardDescription, cardJsonLd, cardTitle, pageMetadata } from "@/lib/seo";

// Fully static, with a real 404 for unknown slugs: see app/(site)/airports/[code]/page.tsx.
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  try {
    const cards = await getAllCards();
    if (cards.length) return cards.map((c) => ({ slug: c.slug }));
  } catch {
    // API asleep or down during the build: pages are rendered on first visit instead.
  }
  return [{ slug: "unknown" }];
}

export async function generateMetadata({ params }: PageProps<"/cards/[slug]">): Promise<Metadata> {
  const slug = (await params).slug.toLowerCase();
  const card = await settle(getCard(slug));
  if (card === null) return { title: "Card not found" };
  if (card === "unavailable") {
    return pageMetadata({
      title: "Card lounge access",
      description: "Which lounges this card gets you into, under which conditions, and since when.",
      path: `/cards/${slug}`,
    });
  }
  return pageMetadata({
    title: cardTitle(card),
    description: cardDescription(card),
    path: `/cards/${card.slug}`,
  });
}

export default async function CardPage({ params }: PageProps<"/cards/[slug]">) {
  const { slug: raw } = await params;
  const slug = raw.toLowerCase();
  if (raw !== slug) permanentRedirect(`/cards/${encodeURIComponent(slug)}`);

  const card = await settle(getCard(slug));
  if (card === null) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {card !== "unavailable" ? <JsonLd data={cardJsonLd(card)} /> : null}
      <CardGuide slug={slug} />
    </div>
  );
}
