import { SiteFooter } from "@/components/layout/site-footer";

/** Content pages: scrolling layout with the footer. The live map at "/" is full-screen instead. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
