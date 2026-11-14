import { Suspense } from "react";

import { BottomTabBar, BottomTabBarLinks } from "@/components/layout/bottom-tab-bar";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Content pages: scrolling layout with the footer, and a bottom tab bar on phones. The live map
 * at "/" is full-screen instead and has no tab bar (see components/layout/bottom-tab-bar.tsx).
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    // Bottom padding on phones so the fixed tab bar never covers the end of the page.
    <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      {/* On routes with request-time params the pathname streams in. */}
      <Suspense fallback={<BottomTabBarLinks pathname={null} />}>
        <BottomTabBar />
      </Suspense>
    </div>
  );
}
