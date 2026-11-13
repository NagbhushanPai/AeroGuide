import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DemoBadge } from "@/components/data/demo-badge";
import { Field } from "@/components/data/field";
import { SourceBadge } from "@/components/data/source-badge";
import { StaleIndicator } from "@/components/data/stale-indicator";
import { VerificationStatus } from "@/components/data/verification-status";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

// Fixed clock: the shared clock is client-only, so tests pin it.
vi.mock("@/hooks/use-now", () => ({ useNow: () => NOW }));

describe("VerificationStatus", () => {
  it("shows the label and check date as text, not only colour", () => {
    render(<VerificationStatus status="verified" verifiedAt="2026-11-01" />);
    expect(screen.getByText(/Verified/)).toBeInTheDocument();
    expect(screen.getByText(/checked 1 Nov 2026/)).toBeInTheDocument();
  });

  it.each([
    ["outdated", "May be outdated"],
    ["unverified", "Not yet verified"],
    ["unavailable", "Not available"],
  ] as const)("labels %s records", (status, label) => {
    render(<VerificationStatus status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("Field", () => {
  it.each([null, undefined, ""])("renders %p as Not available", (value) => {
    render(
      <dl>
        <Field label="Gate" value={value} />
      </dl>,
    );
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("renders 0 as a real value", () => {
    render(
      <dl>
        <Field label="Vertical rate" value={0} />
      </dl>,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("Not available")).not.toBeInTheDocument();
  });

  it("gives screen readers the reason a value is missing", () => {
    render(
      <dl>
        <Field label="Scheduled departure" value={null} missingReason="No open schedule source" />
      </dl>,
    );
    expect(screen.getByText(": No open schedule source")).toHaveClass("sr-only");
  });
});

describe("SourceBadge", () => {
  it("names and links the source, opening safely in a new tab", () => {
    render(<SourceBadge name="adsb.lol" url="https://adsb.lol" updatedAt={ago(90)} />);
    const link = screen.getByRole("link", { name: /adsb\.lol/ });
    expect(link).toHaveAttribute("href", "https://adsb.lol");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("1 min ago")).toBeInTheDocument();
  });
});

describe("DemoBadge", () => {
  it("is announced as demo data in text", () => {
    render(<DemoBadge />);
    expect(screen.getByRole("status")).toHaveTextContent(/demo data/i);
    expect(screen.getByRole("status")).toHaveTextContent(/not real flights/i);
  });
});

describe("StaleIndicator", () => {
  it.each([
    [10, "fresh", "Live"],
    [120, "stale", "Delayed"],
    [600, "expired", "No recent data"],
  ] as const)("age %i s is %s", (age, state, label) => {
    const { container } = render(<StaleIndicator observedAt={ago(age)} />);
    expect(container.querySelector(`[data-freshness="${state}"]`)).not.toBeNull();
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
