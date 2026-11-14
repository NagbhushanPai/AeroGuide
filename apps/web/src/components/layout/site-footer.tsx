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
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <li>
              <a
                href={siteConfig.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Source on GitHub<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            <li>
              <a
                href={siteConfig.contributeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Contribute data<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
