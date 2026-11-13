import Link from "next/link";
import { Compass } from "lucide-react";

import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This page doesn't exist, or hasn't been built yet."
      >
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
