import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  CreditCard,
  ExternalLink,
  ListChecks,
  Plane,
  Sofa,
  type LucideIcon,
} from "lucide-react";

import { DemoBadge } from "@/components/data/demo-badge";
import { VerificationStatus } from "@/components/data/verification-status";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAllAirports, getAllCards, getAllLounges } from "@/lib/api/server";
import { pageMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description:
    "What AeroGuide covers (live flights, airport guides, lounges, card lounge access and an MCP server for AI assistants), where the data comes from and how to contribute.",
  path: "/about",
});

/** Coverage at the last data update, used when the API can't be reached while rendering. */
const FALLBACK_COUNTS = { airports: 116, loungeAirports: 7, cards: 76 };

async function coverage() {
  const [airports, lounges, cards] = await Promise.allSettled([
    getAllAirports(),
    getAllLounges(),
    getAllCards(),
  ]);
  return {
    airports: airports.status === "fulfilled" ? airports.value.length : FALLBACK_COUNTS.airports,
    loungeAirports:
      lounges.status === "fulfilled"
        ? new Set(lounges.value.map((l) => l.iata)).size
        : FALLBACK_COUNTS.loungeAirports,
    cards: cards.status === "fulfilled" ? cards.value.length : FALLBACK_COUNTS.cards,
  };
}

type Feature = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge: string;
};

export default async function AboutPage() {
  const counts = await coverage();
  const features: readonly Feature[] = [
    {
      href: "/",
      title: "Live map",
      description:
        "Aircraft over India from open ADS-B receiver networks, with reported routes and an estimated arrival worked out from position and speed.",
      icon: Plane,
      badge: "Live",
    },
    {
      href: "/airports",
      title: "Airport guides",
      description:
        "Every Indian airport with scheduled passenger service: codes and location, and for the busiest, terminals and the airlines using them.",
      icon: Building2,
      badge: `${counts.airports} airports`,
    },
    {
      href: "/lounges",
      title: "Lounges",
      description:
        "Where each lounge is, its hours, amenities and the programmes it accepts, from the operator's own pages.",
      icon: Sofa,
      badge: `${counts.loungeAirports} airports`,
    },
    {
      href: "/cards",
      title: "Card lounge access",
      description:
        "Lounge benefits of Indian credit cards, read from each bank's terms, with every version and the date it applies from.",
      icon: CreditCard,
      badge: `${counts.cards} cards`,
    },
    {
      href: "/cards#check",
      title: "Eligibility checker",
      description:
        "Pick your cards, an airport and a date: it says yes, no or depends for each lounge, and shows the rule behind every answer.",
      icon: ListChecks,
      badge: "No card numbers",
    },
  ];

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
          information for India. Every fact is sourced and dated, or clearly marked as unverified.
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
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ href, title, description, icon: Icon, badge }) => (
            <li key={href}>
              <Link
                href={href}
                className="group block h-full rounded-xl border bg-card p-5 transition-colors outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Icon aria-hidden="true" className="size-5 text-primary" />
                  <Badge variant="outline">{badge}</Badge>
                </div>
                <p className="font-medium group-hover:underline">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </Link>
            </li>
          ))}
          <li>
            <div className="h-full rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <Bot aria-hidden="true" className="size-5 text-primary" />
                <Badge variant="outline">Read-only</Badge>
              </div>
              <p className="font-medium">For AI assistants (MCP)</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The same airports, lounges, cards, eligibility checks and live flights, as read-only
                tools for assistants that speak the Model Context Protocol, at{" "}
                <code className="font-mono text-xs break-all text-foreground">
                  {siteConfig.mcpUrl}
                </code>
                .
              </p>
              <a
                href={siteConfig.mcpDocsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Set-up guide <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </li>
        </ul>
      </Section>

      {/* Data policy */}
      <Section
        id="policy"
        title="Where the data comes from"
        description="Open sources first, official sources for anything that changes, and nothing filled in by guesswork."
        className="border-t"
      >
        <ul className="grid gap-6 text-sm sm:grid-cols-2">
          <PolicyItem title="Live flights">
            Positions come from community ADS-B receiver networks and are shown as reported. Routes
            are what the flight reports, not an airline schedule, and estimated arrivals are worked
            out from position and speed. Schedules aren&apos;t available from open data.
          </PolicyItem>
          <PolicyItem title="Airports">
            Codes and coordinates come from OurAirports (public domain); mapped terminal buildings
            from OpenStreetMap (ODbL). Terminals and airlines in a guide are checked against the
            airport&apos;s or airline&apos;s own pages and dated.
          </PolicyItem>
          <PolicyItem title="Lounges and cards">
            Lounge details come from the lounge operator; card benefits from the issuing bank&apos;s
            terms. Each record shows its source and when it was checked, and becomes{" "}
            <em>may be outdated</em> once its re-check date passes.
          </PolicyItem>
          <PolicyItem title="Your information">
            The eligibility checker never asks for card numbers or banking details, only which card
            products you hold, and the API doesn&apos;t store what you send. Watched flights and
            saved cards stay in your browser.
          </PolicyItem>
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          AeroGuide is non-commercial. Always confirm terminals, lounge access and card benefits
          with the airline, lounge or bank before you travel.
        </p>
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

      {/* Contributing */}
      <Section
        id="contribute"
        title="Help keep it accurate"
        description="Spotted a lounge that moved, a benefit that changed or a terminal swap? Corrections with a source link are the most useful contribution."
        className="border-t"
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href={siteConfig.contributeUrl} target="_blank" rel="noopener noreferrer">
              Contribute data <ExternalLink aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={siteConfig.repoUrl} target="_blank" rel="noopener noreferrer">
              Source on GitHub <ExternalLink aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
        </div>
      </Section>
    </div>
  );
}

function PolicyItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="space-y-1">
      <h3 className="font-medium">{title}</h3>
      <p className="text-muted-foreground">{children}</p>
    </li>
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
