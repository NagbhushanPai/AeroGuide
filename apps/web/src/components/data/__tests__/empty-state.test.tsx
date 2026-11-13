import { render, screen } from "@testing-library/react";
import { Plane } from "lucide-react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/data/empty-state";

describe("EmptyState", () => {
  it("renders the title, description and actions", () => {
    render(
      <EmptyState icon={Plane} title="Not available yet" description="Nothing to show.">
        <button type="button">Back</button>
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "Not available yet" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to show.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});
