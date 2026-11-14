import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { AirportGuide } from "@/components/airports/airport-guide";
import { JsonLd } from "@/components/data/json-ld";
import { getAirport, getAllAirports, settle } from "@/lib/api/server";
import { airportDescription, airportJsonLd, airportTitle, pageMetadata } from "@/lib/seo";

/*
 * Fully static: rendered once per code and cached (the data is read through `use cache`), so
 * the title, description and JSON-LD are in the first HTML. Codes not listed at build time are
 * rendered on their first visit, and that visit waits for the result, so an unknown code gets a
 * real 404 status rather than a 200 with a "not found" message streamed in.
 *
 * The guide itself still loads in the browser: react-query reads the clock while rendering
 * cached data, which a static prerender doesn't allow, so it can't be seeded from here.
 */
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  try {
    const airports = await getAllAirports();
    if (airports.length) return airports.map((a) => ({ code: a.iata }));
  } catch {
    // API asleep or down during the build: pages are rendered on first visit instead.
  }
  return [{ code: "DEL" }];
}

export async function generateMetadata({
  params,
}: PageProps<"/airports/[code]">): Promise<Metadata> {
  const code = (await params).code.toUpperCase();
  const airport = await settle(getAirport(code));
  if (airport === null) return { title: "Airport not found" };
  if (airport === "unavailable") {
    return pageMetadata({
      title: `${code} airport guide`,
      description: `Codes, location, terminals, airlines and lounges at ${code}, each with its source.`,
      path: `/airports/${code}`,
    });
  }
  return pageMetadata({
    title: airportTitle(airport),
    description: airportDescription(airport),
    path: `/airports/${airport.iata}`,
  });
}

export default async function AirportPage({ params }: PageProps<"/airports/[code]">) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  // One URL per airport: /airports/blr redirects to /airports/BLR.
  if (raw !== code) permanentRedirect(`/airports/${encodeURIComponent(code)}`);

  const airport = await settle(getAirport(code));
  if (airport === null) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {airport !== "unavailable" ? <JsonLd data={airportJsonLd(airport)} /> : null}
      <AirportGuide code={code} />
    </div>
  );
}
