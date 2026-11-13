import type { Metadata } from "next";
import { Plane } from "lucide-react";
import type { ReactNode } from "react";

import { DemoBadge } from "@/components/data/demo-badge";
import { EmptyState } from "@/components/data/empty-state";
import { Field } from "@/components/data/field";
import { PageSkeleton } from "@/components/data/page-skeleton";
import { SourceBadge } from "@/components/data/source-badge";
import { VerificationStatus } from "@/components/data/verification-status";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { StaleExamples } from "./stale-examples";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const COLOR_TOKENS = [
  "background",
  "card",
  "muted",
  "primary",
  "success",
  "warning",
  "destructive",
  "border",
] as const;

/*
 * Internal reference page (not linked from navigation). All values below are component
 * examples, labelled as such, and are not real flight, airport or lounge data.
 */
export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <PageHeader
        title="Design system"
        description="Tokens and shared components. Everything on this page is an example, not real data."
      />

      <Section id="colors" title="Colour tokens" className="border-t">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {COLOR_TOKENS.map((token) => (
            <li key={token} className="space-y-2">
              <div
                className="h-14 rounded-lg border"
                style={{ background: `var(--${token})` }}
                aria-hidden="true"
              />
              <p className="font-mono text-xs">--{token}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Typography" className="border-t">
        <div className="space-y-3">
          <p className="font-heading text-4xl font-semibold tracking-tight">Heading 4xl</p>
          <p className="font-heading text-xl font-semibold">Heading xl</p>
          <p>Body text for descriptions and guides.</p>
          <p className="text-sm text-muted-foreground">Muted supporting text.</p>
          <p className="font-mono text-sm tabular-nums">Mono, tabular: DEL · VIDP · 36,000 ft</p>
        </div>
      </Section>

      <Section id="buttons" title="Buttons and badges" className="border-t">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Badge>Badge</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      <Section
        id="honesty"
        title="Data-honesty components"
        description="Used wherever changeable data is shown (docs/architecture/frontend-architecture.md)."
        className="border-t"
      >
        <div className="grid gap-8 md:grid-cols-2">
          <Example title="VerificationStatus">
            <div className="flex flex-wrap gap-2">
              <VerificationStatus status="verified" verifiedAt="2026-11-01" />
              <VerificationStatus status="outdated" verifiedAt="2026-06-01" />
              <VerificationStatus status="unverified" />
              <VerificationStatus status="unavailable" />
            </div>
          </Example>
          <Example title="DemoBadge">
            <DemoBadge />
          </Example>
          <Example title="SourceBadge">
            <SourceBadge
              name="Example source"
              url="https://example.org"
              updatedAt="2026-11-13T12:00:00Z"
            />
          </Example>
          <Example title="StaleIndicator (relative to now)">
            <StaleExamples />
          </Example>
          <Example title="Field with missing values">
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Altitude" value="36,000 ft" mono />
              <Field label="Vertical rate" value={0} mono />
              <Field
                label="Scheduled departure"
                value={null}
                missingReason="Not available from open data sources"
              />
              <Field label="Gate" value="" />
            </dl>
          </Example>
        </div>
      </Section>

      <Section id="states" title="Empty and loading states" className="border-t">
        <div className="grid gap-8 md:grid-cols-2">
          <EmptyState icon={Plane} title="No aircraft in view" description="Example empty state." />
          <div className="overflow-hidden rounded-xl border">
            <PageSkeleton />
          </div>
        </div>
      </Section>
    </div>
  );
}

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-5">
      <p className="font-mono text-xs text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
