export const siteConfig = {
  name: "AeroGuide",
  description:
    "Live flights, airport guides, lounges and card lounge access for India. Open data, sourced and dated.",
  repoUrl: "https://github.com/NagbhushanPai/AeroGuide",
  contributeUrl:
    "https://github.com/NagbhushanPai/AeroGuide/blob/main/CONTRIBUTING.md#adding-lounges-and-cards",
} as const;

export type NavItem = {
  href: string;
  label: string;
  /** Stage in which the section's real content ships (see docs/planning/roadmap.md). */
  stage: number;
};

export const mainNav: readonly NavItem[] = [
  { href: "/", label: "Live Map", stage: 4 },
  { href: "/airports", label: "Airports", stage: 3 },
  { href: "/lounges", label: "Lounges", stage: 5 },
  { href: "/cards", label: "Cards", stage: 5 },
  { href: "/about", label: "About", stage: 2 },
] as const;

/** True when `pathname` is the nav item's page or a page nested under it. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
