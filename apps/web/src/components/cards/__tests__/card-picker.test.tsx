import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CardPicker } from "@/components/cards/card-picker";
import type { CardSummary } from "@/lib/api/client";

const card = (slug: string, name: string, bank: string): CardSummary => ({
  slug,
  name,
  bank: { slug: bank.toLowerCase(), name: bank, url: "https://example.org" },
  network: null,
  status: "verified",
  domestic: null,
  international: null,
});
const cards = [
  card("test-voyager", "Test Voyager", "Testbank"),
  card("test-atlas", "Test Atlas", "Testbank"),
  card("other-magnus", "Other Magnus", "Otherbank"),
];

function Harness() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <CardPicker
      cards={cards}
      selected={selected}
      onToggle={(slug) =>
        setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]))
      }
    />
  );
}

describe("CardPicker", () => {
  it("filters, picks with the keyboard and removes chips", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Your cards" });
    fireEvent.focus(input);
    expect(screen.getByRole("group", { name: "Otherbank" })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "other mag" } });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("list", { name: "Chosen cards" })).toHaveTextContent("Other Magnus");
    expect(screen.getByText(/Added Other Magnus/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Other Magnus" }));
    expect(screen.queryByRole("list", { name: "Chosen cards" })).not.toBeInTheDocument();
  });

  it("says when nothing matches", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Your cards" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText(/No cards match/)).toBeInTheDocument();
  });
});
