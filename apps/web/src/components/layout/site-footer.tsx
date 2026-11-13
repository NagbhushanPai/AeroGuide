import Link from "next/link";

import { mainNav, siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t text-sm text-muted-foreground">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div className="space-y-2">
          <p className="font-semibold text-foreground">{siteConfig.name}</p>
          <p>{siteConfig.description}</p>
        </div>
        <nav aria-label="Footer">
          <p className="mb-2 font-medium text-foreground">Sections</p>
          <ul className="space-y-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-2">
          <p className="font-medium text-foreground">About the data</p>
          <p>
            Non-commercial and built on open data. Every fact shows its source and the date it was
            checked. Confirm terminals, lounge access and card benefits with the airline, lounge or
            bank before you travel.
          </p>
        </div>
      </div>
    </footer>
  );
}
