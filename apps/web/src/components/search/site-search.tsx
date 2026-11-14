"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, Search, Sofa, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { WakingMessage } from "@/components/data/waking-message";
import { Button } from "@/components/ui/button";
import { useWaking } from "@/hooks/use-waking";
import { searchSite, type SearchHit } from "@/lib/api/client";
import { contentRetry } from "@/lib/api/retry";
import { groupHits, isTypingTarget, MIN_QUERY } from "@/lib/site-search";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 200;

const KIND: Record<SearchHit["kind"], { label: string; icon: LucideIcon }> = {
  airport: { label: "Airports", icon: Building2 },
  lounge: { label: "Lounges", icon: Sofa },
  card: { label: "Cards", icon: CreditCard },
};

const noopSubscribe = () => () => {};
function isApple(): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

/** Header search button, Ctrl/⌘-K shortcut and the search dialog. */
export function SiteSearch() {
  const [open, setOpen] = useState(false);
  // null while server-rendering: the hint keeps its space but shows nothing yet.
  const apple = useSyncExternalStore(noopSubscribe, isApple, () => null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey)
        return;
      if (isTypingTarget(e.target)) return; // leave Ctrl-K to the field being typed in
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="outline"
          aria-keyshortcuts="Control+K Meta+K"
          className="size-9 gap-2 px-0 text-muted-foreground lg:h-9 lg:w-auto lg:px-3"
        >
          <Search aria-hidden="true" />
          {/* The name comes from this text (no aria-label), so it matches what's visible. */}
          <span className="sr-only lg:not-sr-only">Search</span>
          <kbd
            aria-hidden="true"
            className={cn(
              "hidden h-5 min-w-10 items-center justify-center rounded border bg-muted px-1 font-sans text-[11px] font-medium lg:inline-flex",
              apple === null && "invisible",
            )}
          >
            {apple ? "⌘K" : "Ctrl K"}
          </kbd>
        </Button>
      </Dialog.Trigger>
      {open ? <SearchDialog onDone={() => setOpen(false)} /> : null}
    </Dialog.Root>
  );
}

function SearchDialog({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim().replace(/\s+/g, " ")), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const enabled = q.length >= MIN_QUERY;
  const search = useQuery({
    queryKey: ["search", q],
    queryFn: ({ signal }) => searchSite(q, 15, signal),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    ...contentRetry,
  });
  const waking = useWaking(enabled && search.isFetching);

  const hits = useMemo(() => (enabled ? (search.data?.items ?? []) : []), [enabled, search.data]);
  const groups = useMemo(() => groupHits(hits), [hits]);
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;
  const settled = enabled && search.data !== undefined && search.data.q === q && !search.isFetching;

  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, listId]);

  function go(hit: SearchHit) {
    onDone();
    router.push(hit.href);
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0 supports-backdrop-filter:backdrop-blur-xs motion-reduce:animate-none" />
      <Dialog.Content
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        className="fixed inset-0 z-50 flex flex-col bg-popover text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none sm:inset-auto sm:top-[12vh] sm:left-1/2 sm:max-h-[70vh] sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:rounded-xl sm:border"
      >
        <Dialog.Title className="sr-only">Search AeroGuide</Dialog.Title>
        <Dialog.Description className="sr-only">
          Search airports, lounges and cards. Use the up and down arrows to move through results and
          Enter to open one.
        </Dialog.Description>
        <div className="flex items-center gap-2 border-b px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search airports, lounges and cards"
            aria-expanded={flat.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? optionId(activeIndex) : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(Math.min(activeIndex + 1, flat.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(Math.max(activeIndex - 1, 0));
              } else if (e.key === "Enter" && flat[activeIndex]) {
                e.preventDefault();
                go(flat[activeIndex]);
              }
            }}
            placeholder="Airport, city, lounge or card…"
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {text ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText("");
                inputRef.current?.focus();
              }}
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close search"
              className="h-9 px-2 text-muted-foreground"
            >
              <span aria-hidden="true" className="sm:hidden">
                Cancel
              </span>
              <kbd
                aria-hidden="true"
                className="hidden rounded border bg-muted px-1 font-sans text-[11px] sm:inline"
              >
                Esc
              </kbd>
            </Button>
          </Dialog.Close>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {!enabled ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Try &quot;BLR&quot;, &quot;Mumbai&quot;, &quot;Encalm&quot; or &quot;Infinia&quot;.
            </p>
          ) : search.isError && !search.data ? (
            <p role="alert" className="px-2 py-6 text-center text-sm text-muted-foreground">
              Search isn&apos;t available right now. Try again in a moment.
            </p>
          ) : null}
          {waking ? <WakingMessage className="px-2 py-3" /> : null}

          <ul
            id={listId}
            role="listbox"
            aria-label="Results"
            className={cn(flat.length === 0 && "hidden")}
          >
            {groups.map((g) => {
              const { label, icon: Icon } = KIND[g.kind];
              const labelId = `${listId}-${g.kind}`;
              return (
                <li key={g.kind} role="presentation" className="pb-2">
                  <div
                    id={labelId}
                    role="presentation"
                    className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground"
                  >
                    {label}
                  </div>
                  <ul role="group" aria-labelledby={labelId}>
                    {g.hits.map((h) => {
                      const i = flat.indexOf(h);
                      return (
                        <li
                          key={`${h.kind}-${h.key}`}
                          id={optionId(i)}
                          role="option"
                          aria-selected={i === activeIndex}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => go(h)}
                          onMouseMove={() => i !== activeIndex && setActive(i)}
                          className={cn(
                            "flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-2 py-2",
                            i === activeIndex && "bg-muted",
                          )}
                        >
                          <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{h.title}</span>
                            {h.subtitle ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {h.subtitle}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>

          {settled && flat.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No airports, lounges or cards match &quot;{q}&quot;.
            </p>
          ) : null}
          <p aria-live="polite" className="sr-only">
            {settled ? `${flat.length} result${flat.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
