"use client";

import { Check, CreditCard, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { CardSummary } from "@/lib/api/client";
import { groupByBank, matchCards } from "@/lib/card-search";
import { cn } from "@/lib/utils";

type Props = {
  cards: readonly CardSummary[];
  selected: readonly string[];
  onToggle: (slug: string) => void;
  /** Shown instead of the input while the card list isn't available. */
  unavailable?: React.ReactNode;
  describedBy?: string;
};

/**
 * Multi-select typeahead over the card list, grouped by bank. Follows the ARIA combobox pattern:
 * focus stays in the input, arrow keys move the active option (aria-activedescendant), Enter
 * adds or removes it, Backspace on an empty input removes the last chip.
 */
export function CardPicker({ cards, selected, onToggle, unavailable, describedBy }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;

  const bySlug = useMemo(() => new Map(cards.map((c) => [c.slug, c])), [cards]);
  const matches = useMemo(() => matchCards(cards, query), [cards, query]);
  const groups = useMemo(() => groupByBank(matches), [matches]);
  const flat = useMemo(() => groups.flatMap((g) => g.cards), [groups]);
  const showList = open && !unavailable;
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    if (!showList) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
    // optionId only depends on listId, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, showList]);

  function toggle(card: CardSummary) {
    const adding = !selected.includes(card.slug);
    onToggle(card.slug);
    const count = selected.length + (adding ? 1 : -1);
    setAnnounce(
      `${adding ? "Added" : "Removed"} ${card.name}. ${count} card${count === 1 ? "" : "s"} chosen.`,
    );
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }

  function remove(slug: string) {
    const name = bySlug.get(slug)?.name ?? slug;
    onToggle(slug);
    const count = selected.length - 1;
    setAnnounce(`Removed ${name}. ${count} card${count === 1 ? "" : "s"} chosen.`);
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium">
        Your cards
      </label>
      <p id={hintId} className="text-xs text-muted-foreground">
        Type a bank or card name, like &quot;infinia&quot;, &quot;hdfc&quot; or &quot;axis
        mag&quot;. Pick as many as you hold.
      </p>

      {selected.length ? (
        <ul aria-label="Chosen cards" className="flex flex-wrap gap-2">
          {selected.map((slug) => {
            const c = bySlug.get(slug);
            return (
              <li
                key={slug}
                className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border bg-muted pl-3 text-sm"
              >
                <CreditCard aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 truncate">
                  {c ? c.name : slug}
                  <span className="text-muted-foreground">
                    {c ? ` · ${c.bank.name}` : cards.length ? " · not in our list" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(slug)}
                  aria-label={`Remove ${c?.name ?? slug}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {unavailable ? (
        <div className="text-sm text-muted-foreground">{unavailable}</div>
      ) : (
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && flat.length ? optionId(activeIndex) : undefined}
            aria-describedby={[hintId, describedBy].filter(Boolean).join(" ")}
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder={selected.length ? "Add another card…" : "Search cards…"}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!open) setOpen(true);
                else setActive(Math.min(activeIndex + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(Math.max(activeIndex - 1, 0));
              } else if (e.key === "Home" && open) {
                e.preventDefault();
                setActive(0);
              } else if (e.key === "End" && open) {
                e.preventDefault();
                setActive(flat.length - 1);
              } else if (e.key === "Enter") {
                if (showList && flat[activeIndex]) {
                  e.preventDefault();
                  toggle(flat[activeIndex]);
                }
              } else if (e.key === "Escape") {
                if (open || query) e.preventDefault();
                if (open) setOpen(false);
                else setQuery("");
              } else if (e.key === "Backspace" && query === "" && selected.length) {
                remove(selected[selected.length - 1]);
              }
            }}
            className="h-11 w-full rounded-md border bg-background pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          />
          {showList ? (
            <ul
              id={listId}
              role="listbox"
              aria-label="Cards"
              aria-multiselectable="true"
              className="absolute top-full right-0 left-0 z-30 mt-1 max-h-[min(20rem,55vh)] overflow-y-auto overscroll-contain rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              {flat.length === 0 ? (
                <li role="presentation" className="px-3 py-3 text-sm text-muted-foreground">
                  No cards match &quot;{query.trim()}&quot;. Try the bank&apos;s name.
                </li>
              ) : (
                groups.map((g) => {
                  const labelId = `${listId}-${g.bank.slug}`;
                  return (
                    <li key={g.bank.slug} role="presentation">
                      <div
                        id={labelId}
                        role="presentation"
                        className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground"
                      >
                        {g.bank.name}
                      </div>
                      <ul role="group" aria-labelledby={labelId}>
                        {g.cards.map((c) => {
                          const i = flat.indexOf(c);
                          const chosen = selected.includes(c.slug);
                          return (
                            <li
                              key={c.slug}
                              id={optionId(i)}
                              role="option"
                              aria-selected={chosen}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => toggle(c)}
                              onMouseMove={() => i !== activeIndex && setActive(i)}
                              className={cn(
                                "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                                i === activeIndex && "bg-muted",
                              )}
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                                  chosen && "border-primary bg-primary text-primary-foreground",
                                )}
                              >
                                {chosen ? <Check className="size-3" /> : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                {c.name}
                                {c.network ? (
                                  <span className="text-muted-foreground"> · {c.network}</span>
                                ) : null}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
