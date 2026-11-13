import type { Metadata } from "next";
import { Plane } from "lucide-react";

import { ComingSoonPage } from "@/components/layout/coming-soon-page";

export const metadata: Metadata = { title: "Live Flights" };

export default function LivePage() {
  return (
    <ComingSoonPage
      title="Live Flights"
      description="A full-screen map of aircraft over India."
      icon={Plane}
      stage={4}
      planned="The live map will show aircraft positions from open ADS-B networks, with the data source and last-updated time on screen."
    />
  );
}
