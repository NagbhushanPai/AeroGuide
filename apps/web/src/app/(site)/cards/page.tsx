import type { Metadata } from "next";
import { CreditCard } from "lucide-react";

import { ComingSoonPage } from "@/components/layout/coming-soon-page";

export const metadata: Metadata = { title: "Cards" };

export default function CardsPage() {
  return (
    <ComingSoonPage
      title="Cards"
      description="Credit-card lounge access and an eligibility checker."
      icon={CreditCard}
      stage={5}
      planned="A directory of cards with their lounge policies and effective dates, and a checker that never asks for card numbers."
    />
  );
}
