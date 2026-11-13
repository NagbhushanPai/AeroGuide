import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

type ComingSoonPageProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  stage: number;
  /** What the section will contain, stated plainly. */
  planned: string;
};

/** Placeholder used until a section's stage ships. States clearly that nothing is available yet. */
export function ComingSoonPage({ title, description, icon, stage, planned }: ComingSoonPageProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title="Not available yet"
        description={
          <>
            <p>{planned}</p>
            <p className="mt-2">Planned for development stage {stage}.</p>
          </>
        }
      >
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
