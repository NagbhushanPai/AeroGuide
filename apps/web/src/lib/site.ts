/** Public site URL, used for canonical links, the sitemap and Open Graph images. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://aeroguide-theta.vercel.app"
).replace(/\/$/, "");

export const siteConfig = {
  name: "AeroGuide",
  tagline: "Live flights, airports, lounges and card lounge access for India",
  description:
    "Live flights, airport guides, lounges and card lounge access for India. Open data, sourced and dated.",
  url: SITE_URL,
  repoUrl: "https://github.com/NagbhushanPai/AeroGuide",
  contributeUrl:
    "https://github.com/NagbhushanPai/AeroGuide/blob/main/CONTRIBUTING.md#adding-lounges-and-cards",
  mcpUrl: "https://aeroguide-erq3.onrender.com/mcp",
  mcpDocsUrl: "https://github.com/NagbhushanPai/AeroGuide/blob/main/docs/api/mcp.md",
} as const;

export type NavItem = {
  href: string;
  label: string;
  /** Label for the compact mobile tab bar. */
  shortLabel: string;
};

export const mainNav: readonly NavItem[] = [
  { href: "/", label: "Live Map", shortLabel: "Map" },
  { href: "/airports", label: "Airports", shortLabel: "Airports" },
  { href: "/fares", label: "Fares", shortLabel: "Fares" },
  { href: "/lounges", label: "Lounges", shortLabel: "Lounges" },
  { href: "/cards", label: "Cards", shortLabel: "Cards" },
  { href: "/about", label: "About", shortLabel: "About" },
] as const;

/** True when `pathname` is the nav item's page or a page nested under it. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Absolute URL for a site path ("/airports/DEL" -> "https://…/airports/DEL"). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
