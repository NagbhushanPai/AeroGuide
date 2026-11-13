import type { Metadata } from "next";
import { Sofa } from "lucide-react";

import { ComingSoonPage } from "@/components/layout/coming-soon-page";

export const metadata: Metadata = { title: "Lounges" };

export default function LoungesPage() {
  return (
    <ComingSoonPage
      title="Lounges"
      description="Airport lounges by airport, terminal and amenities."
      icon={Sofa}
      stage={5}
      planned="A lounge directory with locations, opening hours, amenities and accepted access methods, each with its source."
    />
  );
}
