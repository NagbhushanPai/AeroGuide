/**
 * Metadata and schema.org JSON-LD for detail pages. Built only from fields the API returned:
 * nothing is guessed or padded to make a richer snippet.
 */
import type { Metadata } from "next";

import type { AirportDetail, CardDetail, LoungeDetail } from "@/lib/api/client";
import { absoluteUrl, siteConfig } from "@/lib/site";

const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${siteConfig.name}: ${siteConfig.tagline}`,
};

/** Open Graph defaults shared by every page (child openGraph objects replace, not merge). */
export const baseOpenGraph = {
  siteName: siteConfig.name,
  type: "website",
  locale: "en_IN",
  images: [OG_IMAGE],
} satisfies Metadata["openGraph"];

/** Title, description, canonical URL, Open Graph and Twitter card for one page. */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...baseOpenGraph, title, description, url: path },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

function sentence(parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(" ");
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// ---- Airports ----

export function airportTitle(a: Pick<AirportDetail, "name" | "iata" | "city">): string {
  return `${a.name} (${a.iata})${a.city ? ` · ${a.city}` : ""}`;
}

export function airportDescription(a: AirportDetail): string {
  const place = [a.city, a.state].filter(Boolean).join(", ");
  const codes = a.icao ? `IATA ${a.iata}, ICAO ${a.icao}` : `IATA ${a.iata}`;
  return sentence([
    `${a.name} (${codes})${place ? `, ${place}` : ""}.`,
    a.terminals.length
      ? `Terminals and the airlines using them, checked against official sources,`
      : "Location and codes,",
    "airlines seen in live flight data and lounges, each with its source.",
  ]);
}

export function airportJsonLd(a: AirportDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "Airport",
    "@id": absoluteUrl(`/airports/${a.iata}`),
    name: a.name,
    iataCode: a.iata,
    ...(a.icao ? { icaoCode: a.icao } : {}),
    url: absoluteUrl(`/airports/${a.iata}`),
    geo: { "@type": "GeoCoordinates", latitude: a.lat, longitude: a.lon },
    ...(a.city || a.state
      ? {
          address: {
            "@type": "PostalAddress",
            ...(a.city ? { addressLocality: a.city } : {}),
            ...(a.state ? { addressRegion: a.state } : {}),
            addressCountry: "IN",
          },
        }
      : {}),
    ...(a.official_source ? { sameAs: [a.official_source.url] } : {}),
  };
}

// ---- Lounges ----

const SCOPE = {
  domestic: "domestic",
  international: "international",
  both: "domestic and international",
};

export function loungeTitle(l: Pick<LoungeDetail, "name" | "airport_name" | "terminal">): string {
  return `${l.name} · ${l.airport_name}${l.terminal ? ` ${l.terminal}` : ""}`;
}

export function loungeDescription(l: LoungeDetail): string {
  const programmes = l.programs.map((p) => p.name);
  return sentence([
    `${l.name} at ${l.airport_name} (${l.iata})${l.terminal ? `, ${l.terminal}` : ""}:`,
    `${l.side} ${SCOPE[l.scope]} lounge for ${l.direction}.`,
    programmes.length ? `Accepts ${list(programmes)}.` : null,
    "Opening hours, amenities and which cards get you in, with sources.",
  ]);
}

export function loungeJsonLd(l: LoungeDetail) {
  const url = absoluteUrl(`/lounges/${l.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": url,
    name: l.name,
    url,
    ...(l.operator ? { brand: { "@type": "Organization", name: l.operator } } : {}),
    ...(l.amenities.length
      ? {
          amenityFeature: l.amenities.map((a) => ({
            "@type": "LocationFeatureSpecification",
            name: a.label,
            value: true,
          })),
        }
      : {}),
    ...(l.opening_hours && l.opening_hours.mode === "24h"
      ? {
          openingHoursSpecification: {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ],
            opens: "00:00",
            closes: "23:59",
          },
        }
      : {}),
    containedInPlace: {
      "@type": "Airport",
      "@id": absoluteUrl(`/airports/${l.iata}`),
      name: l.airport_name,
      iataCode: l.iata,
    },
  };
}

// ---- Cards ----

export function cardTitle(c: Pick<CardDetail, "name" | "bank">): string {
  return `${c.name} by ${c.bank.name}: lounge access`;
}

export function cardDescription(c: CardDetail): string {
  return sentence([
    `Airport lounge benefits of the ${c.name} from ${c.bank.name}.`,
    c.domestic ? `Domestic: ${c.domestic}` : null,
    c.international ? `International: ${c.international}` : null,
    "Read from the bank's own pages, with the date each version applies from.",
  ]);
}

export function cardJsonLd(c: CardDetail) {
  const url = absoluteUrl(`/cards/${c.slug}`);
  const benefits = [c.domestic, c.international].filter(Boolean).join(" ");
  return {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    "@id": url,
    name: c.name,
    url,
    ...(benefits ? { description: benefits } : {}),
    category: "Credit card",
    ...(c.network ? { brand: { "@type": "Brand", name: c.network } } : {}),
    provider: { "@type": "BankOrCreditUnion", name: c.bank.name, url: c.bank.url },
    sameAs: [c.product_url],
  };
}

/** JSON for a <script type="application/ld+json">, safe to inline in HTML. */
export function jsonLdString(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
