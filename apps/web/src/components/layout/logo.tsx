import Link from "next/link";

import { siteConfig } from "@/lib/site";

/** AeroGuide mark: a heading needle inside a ring. */
export function Logo() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-7 text-primary">
        <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M16 6 L20 18 L16 15.5 L12 18 Z" fill="currentColor" />
        <circle cx="16" cy="22.5" r="1.5" fill="currentColor" opacity="0.6" />
      </svg>
      <span className="font-heading text-base font-semibold tracking-tight">{siteConfig.name}</span>
    </Link>
  );
}
