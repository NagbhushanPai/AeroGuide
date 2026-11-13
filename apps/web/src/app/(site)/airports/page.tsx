import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { ComingSoonPage } from "@/components/layout/coming-soon-page";

export const metadata: Metadata = { title: "Airports" };

export default function AirportsPage() {
  return (
    <ComingSoonPage
      title="Airports"
      description="Guides to Indian airports: terminals, airlines, facilities and transport."
      icon={Building2}
      stage={3}
      planned="Airport guides for DEL, BOM, BLR, HYD, MAA, COK and JAI, with a source and check date on every fact."
    />
  );
}
