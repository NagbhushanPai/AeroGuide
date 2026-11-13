import type { Metadata } from "next";

import { LiveExplorer } from "@/components/live/live-explorer";

export const metadata: Metadata = {
  title: { absolute: "AeroGuide · Live flights over India" },
  description:
    "Live map of aircraft over India from open ADS-B data, with reported routes, estimated arrival and airport overlays.",
};

export default function HomePage() {
  return <LiveExplorer />;
}
