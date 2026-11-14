import { describe, expect, it } from "vitest";

import type { AirportDetail, CardDetail, LoungeDetail } from "@/lib/api/client";
import {
  airportJsonLd,
  airportTitle,
  cardJsonLd,
  cardTitle,
  jsonLdString,
  loungeJsonLd,
  loungeTitle,
  pageMetadata,
} from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

const provenance = {
  status: "unverified",
  verified_at: null,
  reverify_due: null,
  source: null,
  notes: null,
} as unknown as AirportDetail["provenance"];

const airport = {
  iata: "TST",
  icao: null,
  name: "Test International Airport",
  city: "Test City",
  state: null,
  region: "South",
  lat: 12.95,
  lon: 77.66,
  size: "large",
  has_guide: true,
  status: "unverified",
  elevation_ft: null,
  timezone: "Asia/Kolkata",
  official_source: null,
  provenance,
  terminals: [],
  mapped_terminals: null,
  terminal_note: "Confirm the terminal.",
} satisfies AirportDetail;

describe("titles", () => {
  it("follow the agreed patterns", () => {
    expect(airportTitle(airport)).toBe("Test International Airport (TST) · Test City");
    expect(airportTitle({ ...airport, city: null })).toBe("Test International Airport (TST)");
    expect(loungeTitle({ name: "Test Lounge", airport_name: "Test Airport", terminal: "T9" })).toBe(
      "Test Lounge · Test Airport T9",
    );
    expect(
      cardTitle({ name: "Test Voyager", bank: { slug: "b", name: "Test Bank", url: "x" } }),
    ).toBe("Test Voyager by Test Bank: lounge access");
  });
});

describe("pageMetadata", () => {
  it("sets a canonical path, Open Graph and a Twitter card", () => {
    const m = pageMetadata({ title: "T", description: "D", path: "/airports/TST" });
    expect(m.alternates?.canonical).toBe("/airports/TST");
    expect(m.openGraph).toMatchObject({
      url: "/airports/TST",
      siteName: "AeroGuide",
      locale: "en_IN",
    });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "T" });
  });
});

describe("JSON-LD", () => {
  it("describes an airport with only the fields we have", () => {
    const ld = airportJsonLd(airport);
    expect(ld).toMatchObject({
      "@type": "Airport",
      iataCode: "TST",
      geo: { latitude: 12.95, longitude: 77.66 },
      url: `${SITE_URL}/airports/TST`,
    });
    expect(ld).not.toHaveProperty("icaoCode");
    expect(ld).not.toHaveProperty("sameAs");
    expect(ld.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Test City",
      addressCountry: "IN",
    });
  });

  it("places a lounge inside its airport", () => {
    const ld = loungeJsonLd({
      slug: "test-lounge",
      name: "Test Lounge",
      iata: "TST",
      airport_name: "Test International Airport",
      operator: null,
      amenities: [],
      opening_hours: null,
    } as unknown as LoungeDetail);
    expect(ld.containedInPlace).toMatchObject({ "@type": "Airport", iataCode: "TST" });
    expect(ld).not.toHaveProperty("brand");
    expect(ld).not.toHaveProperty("openingHoursSpecification");
  });

  it("describes a card as a financial product from its bank", () => {
    const ld = cardJsonLd({
      slug: "test-voyager",
      name: "Test Voyager",
      bank: { slug: "test-bank", name: "Test Bank", url: "https://example.org/bank" },
      network: null,
      domestic: "2 visits a quarter.",
      international: null,
      product_url: "https://example.org/card",
    } as unknown as CardDetail);
    expect(ld).toMatchObject({
      "@type": "FinancialProduct",
      provider: { name: "Test Bank" },
      description: "2 visits a quarter.",
    });
    expect(ld).not.toHaveProperty("brand");
  });

  it("can't close the script element it's inlined in", () => {
    expect(jsonLdString({ name: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});
