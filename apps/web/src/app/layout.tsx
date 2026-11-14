import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/layout/site-header";
import { baseOpenGraph } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.name, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  // Pages that set their own openGraph repeat these (nested fields are replaced, not merged).
  // The image comes from app/opengraph-image.tsx.
  openGraph: {
    siteName: baseOpenGraph.siteName,
    type: baseOpenGraph.type,
    locale: baseOpenGraph.locale,
    title: siteConfig.name,
    description: siteConfig.description,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  // Browser chrome colour per OS theme: the dark and light --background tokens.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f1624" },
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the `dark`/`light` class before paint (dark by default), so the server
    // markup can't know it: suppressHydrationWarning applies to this element only.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          {/* Each route group supplies its own <main id="main">: (site) scrolls, the map is fixed. */}
          {children}
        </Providers>
      </body>
    </html>
  );
}
