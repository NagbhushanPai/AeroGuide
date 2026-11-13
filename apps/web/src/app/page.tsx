import Link from "next/link";
import { ArrowRight, Building2, CreditCard, Plane, Sofa } from "lucide-react";

import { Button } from "@/components/ui/button";

const sections = [
  {
    href: "/live",
    title: "Live Flights",
    description: "Aircraft over India on a live map, from open ADS-B data.",
    icon: Plane,
  },
  {
    href: "/airports",
    title: "Airports",
    description: "Terminals, airlines, food, shops and transport, with sources.",
    icon: Building2,
  },
  {
    href: "/lounges",
    title: "Lounges",
    description: "Find lounges by airport, terminal and amenities.",
    icon: Sofa,
  },
  {
    href: "/cards",
    title: "Cards",
    description: "Check which credit cards give you lounge access, and when.",
    icon: CreditCard,
  },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <section className="max-w-2xl space-y-6">
        <p className="font-mono text-xs tracking-widest text-primary uppercase">
          Aviation intelligence · India
        </p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          Flights, airports and lounges, with the sources shown.
        </h1>
        <p className="text-lg text-muted-foreground">
          AeroGuide brings together live flight tracking, airport guides and lounge access
          information. Every fact is sourced and dated, or clearly marked as unverified.
        </p>
        <Button asChild size="lg">
          <Link href="/live">
            Open the live map <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>

      <section aria-labelledby="sections-heading" className="mt-16">
        <h2 id="sections-heading" className="sr-only">
          Sections
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sections.map(({ href, title, description, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="block h-full rounded-xl border bg-card p-5 transition-colors outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon aria-hidden="true" className="mb-3 size-5 text-primary" />
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
