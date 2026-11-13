import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Building2, CreditCard, Plane, Sofa, type LucideIcon } from "lucide-react";

import { DemoBadge } from "@/components/data/demo-badge";
import { EmptyState } from "@/components/data/empty-state";
import { VerificationStatus } from "@/components/data/verification-status";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "About" };

type Feature = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
};

const features: readonly Feature[] = [
  {
    href: "/",
    title: "Live Map",
    description: "Aircraft over India on a live map, from open ADS-B networks.",
    icon: Plane,
    available: true,
  },
  {
    href: "/airports",
    title: "Airport guides",
    description:
      "Indian airports with scheduled service. Guides add terminals and airlines, with sources.",
    icon: Building2,
    available: true,
  },
  {
    href: "/lounges",
    title: "Lounges",
    description: "Lounges by airport and terminal, with hours and the programmes they accept.",
    icon: Sofa,
    available: true,
  },
  {
    href: "/cards",
    title: "Card lounge access",
    description: "Which credit cards get you in, under which conditions, and when.",
    icon: CreditCard,
    available: true,
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="max-w-2xl space-y-6 pt-16 pb-10 sm:pt-24">
        <p className="font-mono text-xs tracking-widest text-primary uppercase">About AeroGuide</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          Flights, airports and lounges, with the sources shown.
        </h1>
        <p className="text-lg text-muted-foreground">
          AeroGuide brings together live flight tracking, airport guides and lounge access
          information. Every fact is sourced and dated, or clearly marked as unverified.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/">
              Open the live map <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/airports">Browse airports</Link>
          </Button>
        </div>
      </section>

      {/* What's here */}
      <Section id="features" title="What you'll find" className="border-t">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ href, title, description, icon: Icon, available }) => (
            <li key={href}>
              <Link
                href={href}
                className="group block h-full rounded-xl border bg-card p-5 transition-colors outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="mb-3 flex items-center justify-between">
                  <Icon aria-hidden="true" className="size-5 text-primary" />
                  <Badge variant={available ? "default" : "outline"}>
                    {available ? "Live" : "Coming soon"}
                  </Badge>
                </div>
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* Featured airport guides: data-driven from Stage 3 */}
      <Section
        id="airports"
        title="Airport guides"
        description="Guides to seven major Indian airports, researched from official airport, airline and AAI sources."
        className="border-t"
      >
        <EmptyState
          icon={Building2}
          title="Guides are being researched"
          description="Airport guides will appear here once their facts are checked against official sources. Nothing is shown until it's sourced."
        />
      </Section>

      {/* Lounges and cards */}
      <Section
        id="lounges-cards"
        title="Lounges and card access"
        description="Find a lounge, then check whether your card gets you in, based on the bank's published terms."
        className="border-t"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={Sofa}
            title="Lounge directory"
            description="Lounge locations, opening hours, amenities and accepted access methods, each with its source."
          />
          <EmptyState
            icon={CreditCard}
            title="Eligibility checker"
            description="Pick your card, airport and travel date. You'll never be asked for card numbers or banking details."
          />
        </div>
      </Section>

      {/* Data honesty legend */}
      <Section
        id="data"
        title="How to read our data"
        description="Every changeable fact carries one of these labels. They're explained here so you know how far to trust what you see."
        className="border-t"
      >
        <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <LegendItem
            term={<VerificationStatus status="verified" />}
            detail="Checked against an official source on the date shown."
          />
          <LegendItem
            term={<VerificationStatus status="outdated" />}
            detail="Was verified, but its re-check date has passed. It may have changed."
          />
          <LegendItem
            term={<VerificationStatus status="unverified" />}
            detail="Not yet confirmed with an official source. Treat it as a lead."
          />
          <LegendItem
            term={<VerificationStatus status="unavailable" />}
            detail="We looked, and no reliable source exists. We don't guess."
          />
          <LegendItem
            term={<DemoBadge />}
            detail="Simulated aircraft used for testing. Never shown as real flights."
          />
        </dl>
      </Section>
    </div>
  );
}

function LegendItem({ term, detail }: { term: ReactNode; detail: string }) {
  return (
    <div className="space-y-2">
      <dt>{term}</dt>
      <dd className="text-sm text-muted-foreground">{detail}</dd>
    </div>
  );
}
