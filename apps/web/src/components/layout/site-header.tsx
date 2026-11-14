import { Suspense } from "react";

import { SiteSearch } from "@/components/search/site-search";

import { Logo } from "./logo";
import { MainNav, MainNavLinks } from "./main-nav";
import { MobileNav, MobileNavMenu } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4">
        <Logo />
        <div className="flex items-center gap-1">
          <div className="hidden sm:block">
            {/* On routes with request-time params (/airports/DEL) the pathname streams in. */}
            <Suspense fallback={<MainNavLinks pathname={null} />}>
              <MainNav />
            </Suspense>
          </div>
          <SiteSearch />
          <ThemeToggle />
          <Suspense fallback={<MobileNavMenu pathname={null} />}>
            <MobileNav />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
