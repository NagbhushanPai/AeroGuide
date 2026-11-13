"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { isActive, mainNav } from "@/lib/site";

export function MainNav() {
  return <MainNavLinks pathname={usePathname()} />;
}

/** `pathname` is null while it isn't known yet (Suspense fallback): nothing is marked active. */
export function MainNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="-mx-2 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 px-2">
        {mainNav.map((item) => {
          const active = pathname !== null && isActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:bg-muted hover:text-foreground",
                  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-muted text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
