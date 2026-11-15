"use client";

import {
  Building2,
  CreditCard,
  Info,
  Map as MapIcon,
  Sofa,
  TicketsPlane,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActive, mainNav } from "@/lib/site";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "/": MapIcon,
  "/airports": Building2,
  "/fares": TicketsPlane,
  "/lounges": Sofa,
  "/cards": CreditCard,
  "/about": Info,
};

export function BottomTabBar() {
  return <BottomTabBarLinks pathname={usePathname()} />;
}

/**
 * Phone-only tab bar for the content pages. Not shown on the live map, which already fills the
 * screen with its own controls (zoom, attribution, the flight card) along the bottom edge; the
 * header's menu button still reaches every section there.
 *
 * `pathname` is null while it isn't known yet (Suspense fallback): nothing is marked active.
 */
export function BottomTabBarLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="grid h-16 grid-cols-6">
        {mainNav.map((item) => {
          const Icon = ICONS[item.href] ?? Info;
          const active = pathname !== null && isActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none",
                  "text-muted-foreground hover:text-foreground focus-visible:bg-muted",
                  active && "text-primary",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {item.shortLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
