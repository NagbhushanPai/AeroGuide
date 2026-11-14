import type { Metadata } from "next";

import { LiveExplorer } from "@/components/live/live-explorer";
import { pageMetadata } from "@/lib/seo";

const title = "AeroGuide · Live flights over India";
const base = pageMetadata({
  title,
  description:
    "Live map of aircraft over India from open ADS-B data, with reported routes, estimated arrival and airport overlays.",
  path: "/",
});

export const metadata: Metadata = { ...base, title: { absolute: title } };

export default function HomePage() {
  return <LiveExplorer />;
}
