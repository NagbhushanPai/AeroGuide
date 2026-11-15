import type { MetadataRoute } from "next";

import { getAllAirports, getAllCards, getAllLounges } from "@/lib/api/server";
import { absoluteUrl } from "@/lib/site";

const STATIC_PAGES: MetadataRoute.Sitemap = [
  { url: absoluteUrl("/"), changeFrequency: "always", priority: 1 },
  { url: absoluteUrl("/airports"), changeFrequency: "weekly", priority: 0.8 },
  { url: absoluteUrl("/fares"), changeFrequency: "monthly", priority: 0.7 },
  { url: absoluteUrl("/lounges"), changeFrequency: "weekly", priority: 0.8 },
  { url: absoluteUrl("/cards"), changeFrequency: "weekly", priority: 0.8 },
  { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.5 },
];

/** Each list is optional: if the API is down, that section is left out, never invented. */
async function entries<T>(
  read: () => Promise<T[]>,
  toEntry: (item: T) => MetadataRoute.Sitemap[number],
): Promise<MetadataRoute.Sitemap> {
  try {
    return (await read()).map(toEntry);
  } catch (err) {
    console.warn(`[sitemap] ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [airports, lounges, cards] = await Promise.all([
    entries(
      () => getAllAirports(),
      (a) => ({
        url: absoluteUrl(`/airports/${a.iata}`),
        changeFrequency: "weekly",
        priority: a.has_guide ? 0.7 : 0.5,
      }),
    ),
    entries(
      () => getAllLounges(),
      (l) => ({ url: absoluteUrl(`/lounges/${l.slug}`), changeFrequency: "weekly", priority: 0.6 }),
    ),
    entries(
      () => getAllCards(),
      (c) => ({ url: absoluteUrl(`/cards/${c.slug}`), changeFrequency: "weekly", priority: 0.6 }),
    ),
  ]);
  return [...STATIC_PAGES, ...airports, ...lounges, ...cards];
}
