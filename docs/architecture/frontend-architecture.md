# Frontend architecture

Last updated: 2026-11-16. Status: implemented.

## Stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui (Radix primitives), Lucide icons, MapLibre GL JS 6, TanStack Query, `next-themes`. The API types are generated from FastAPI's OpenAPI schema (`openapi-typescript`, `pnpm gen:api` → `src/lib/api/schema.d.ts`) and used by thin `fetch` wrappers in `src/lib/api/client.ts`, so a contract change breaks the type check instead of failing at runtime. Tests: Vitest (unit, Testing Library) and Playwright (e2e, with axe).

## Route map

| Route | Rendering | Data |
|---|---|---|
| `/` | **Live map** (homepage). Static shell + client-only map (`dynamic(..., { ssr: false })`) | Positions polled every 15 s through TanStack Query |
| `/about` | Static | What AeroGuide is, its sections, the data-label legend |
| `/live` | Redirects to `/` (`next.config.ts`) | — |
| `/airports` | Static shell; the directory is a client component reading its filters from URL params (Suspense boundary) | Airport search API |
| `/airports/[code]` | Fully static: `generateStaticParams` from the airport list, server reads cached with `use cache`; metadata and JSON-LD in the first HTML, the guide itself loads in the browser | Airport detail API, airlines seen |
| `/lounges`, `/lounges/[slug]` | Same pattern | Lounge APIs |
| `/cards`, `/cards/[slug]` | Same pattern. `/cards` also hosts the **lounge access checker** (`?airport=`, `?on=`, `?scope=`, `?card=`) | Card APIs, `POST /api/v1/eligibility` |
| `/fares` | Static shell + client search form reading route, dates, passengers and cabin from the URL | `POST /api/v1/fares/search`, booking links, budget |
| `/design-system` | Static, unlinked `noindex` page showing the data-honesty components | — |

Plus `robots.ts`, `sitemap.ts` (built from the API's lists) and `opengraph-image.tsx`. There is no flight page: open data has no schedules, so a flight is shown in the live map's panel (`?f={icao24}`).

Search and filter state lives in **URL search params** (`src/lib/url-state.ts`, native History API), so it can be shared and bookmarked. The server-side reads for metadata and the sitemap (`src/lib/api/server.ts`) have short time limits and fall back to generic metadata when the free-tier API is asleep.

## Folder layout (`apps/web`)

```text
src/
├── app/                      # page.tsx (live map), (site)/ content routes, layout.tsx, error.tsx, not-found.tsx, robots.ts, sitemap.ts
├── components/
│   ├── ui/                   # shadcn/ui primitives (badge, button, card, dropdown-menu, separator, sheet, skeleton)
│   ├── layout/               # SiteHeader, MainNav, MobileNav, BottomTabBar, SiteFooter, PageHeader, Section, ThemeToggle, Logo
│   ├── data/                 # SourceBadge, VerificationStatus, DemoBadge, StaleIndicator, Field, RelativeTime, EmptyState, ErrorState, PageSkeleton, WakingMessage, JsonLd
│   ├── live/                 # the live map (see below)
│   ├── search/               # SiteSearch (Ctrl/Cmd-K) and FilterChip
│   ├── airports/ lounges/ cards/ fares/   # directories, guides, the lounge checker, fare search
│   └── providers.tsx         # QueryClient and theme providers
├── hooks/                    # use-now.ts (shared clock), use-waking.ts (cold-start state)
└── lib/
    ├── api/                  # schema.d.ts (generated), client.ts (browser fetch wrappers), server.ts (cached server reads), retry.ts
    ├── freshness.ts  airports.ts  lounges.ts  checker.ts  fares.ts  card-search.ts  site-search.ts  saved-cards.ts  seo.ts  site.ts  url-state.ts
    └── __tests__/            # Vitest unit tests for the pure logic
public/data/airports-in.geojson   # built by scripts/build_airport_data.py (repo root)
public/vendor/                    # MapLibre worker, copied at dev/build time (git-ignored)
```

## Data-honesty components (shared everywhere)

Implemented in Stage 2 in `src/components/data/`. Examples are shown at `/design-system`, an unlinked `noindex` page.

| Component | Behaviour |
|---|---|
| `SourceBadge` | Source name + link (opens in a new tab, `noopener`) + "updated {relative time}". Required on any page showing changeable data |
| `VerificationStatus` | `verified` (with date), `unverified`, `outdated` (past its re-verify date) or `unavailable`. Icon **and** text, never colour alone |
| `DemoBadge` | Prominent "DEMO DATA" pill with a fixed amber background, so it stays legible in both themes. Rendered whenever the response has `meta.mode = "demo"` |
| `StaleIndicator` | Live (< 60 s), Delayed (< 5 min) or No recent data, with "last seen" |
| `Field` / `NotAvailable` | `null`, `undefined` and `""` render "Not available" (with an optional reason for screen readers). `0` is shown as a real value |
| `RelativeTime` | "12 min ago" with the exact IST time as a tooltip |
| `EmptyState`, `ErrorState`, `PageSkeleton` | Honest empty, failed and loading states. A failed load is never shown as an empty list |

Times come from one shared client clock (`useNow`, built on `useSyncExternalStore`). During server rendering and hydration it returns `null`, so components render an absolute IST time first. That keeps markup deterministic, which Cache Components requires, with no hydration mismatch. The pure logic (age, thresholds, outdated calculation, IST formatting) lives in `src/lib/freshness.ts` and is unit-tested.

## Theme

`next-themes` sets a `dark` or `light` class on `<html>` before paint. The default is dark, there's no system preference, and the choice is remembered in `localStorage`. The theme toggle renders both icons and swaps them with CSS, so there is no hydration flash. Both themes pass axe colour-contrast checks in CI.

## Search

The hero flight search from the first plan was held back until there was real search behind it. Search now exists in two places, both backed by the API: **site search** in the header (`components/search/site-search.tsx`, Ctrl/Cmd-K) over airports, lounges and cards (`GET /api/v1/search`), and the **live map's** sidebar search and From/To filters over the current snapshot. The `/fares` form is the only search that costs upstream requests, and it shows the remaining allowance.

## Route groups

- `app/page.tsx` is the full-screen map (header only, no footer or bottom tab bar).
- `app/(site)/…` holds content pages with a scrolling layout, footer and, on phones, a fixed bottom tab bar (`(site)/layout.tsx`).

## Live map design

Implemented in `src/components/live/`: `live-explorer.tsx` (layout and state), `live-map.tsx` (MapLibre), `flight-list.tsx` (sidebar with search and From/To filters), `route-airport-filter.tsx` (the searchable From/To combobox), `motion.ts` (dead reckoning between updates), `flight-panel.tsx` (selected flight), `live-status.tsx` (mode, count, source, IST clock), `layer-toggles.tsx`, `alerts-menu.tsx` and `use-watchlist.ts` (watched flights).

- **Layers:** Traffic (aircraft), Airports (OurAirports public-domain data: 116 Indian airports with scheduled service, built by `scripts/build_airport_data.py` into `public/data/airports-in.geojson`, from the same rows as the API's airport seed), Weather (RainViewer radar tiles, free for personal and community use, credited on the map). Basemap: OpenFreeMap `dark` or `positron`, following the theme.
- **MapLibre 6 worker:** MapLibre 6 loads its web worker from a file next to its bundle, which Next.js doesn't emit. `scripts/copy-maplibre-worker.mjs` copies it to `public/vendor/` on `dev` and `build` (git-ignored), and the map calls `setWorkerUrl`.
- **Watch alerts:** star a flight to be told (on the page, and through browser notifications if allowed) when it takes off, lands, or drops out of or returns to coverage, while the tab is open. These are the only events ADS-B can show honestly. The list is stored in `localStorage`. Events are only computed from `live` data, so a feed outage doesn't look like every flight losing signal.

- **Rendering:** one GeoJSON source, `aircraft`, rendered as a **symbol layer** (SDF plane icon, `icon-rotate: ['get','track']`, `icon-rotation-alignment: map`, colour from an altitude expression). This handles thousands of aircraft on the GPU. DOM markers are avoided.
- **Update loop:** `usePositions()` with a 15 s `refetchInterval`, paused when the tab is hidden. The API itself refreshes upstream once a minute. Each update calls `source.setData()`. A "Check now" button on the outage overlay refetches at once; otherwise nothing needs a reload.
- **Motion between updates:** `motion.ts` moves each airborne aircraft (ground speed ≥ 40 kt, known track) along its track by the distance flown since `position_time`, capped at 75 s, and the map redraws every 500 ms while the tab is visible. The selected plane's `feature-state` is reapplied after each redraw. Motion is off when the data has expired (the faded, `dimmed` state) or when `prefers-reduced-motion` is set, and the legend says in-between positions are estimates. Details in [flight data flow](./flight-data-flow.md#motion-between-updates-browser).
- **From/To filters:** `route-airport-filter.tsx` is an ARIA combobox listing only the airports that appear in the current reported routes, busiest first with flight counts, searchable by IATA code or city (city and airport names come from the Indian airport layer; other airports show the code). Arrow keys, Enter and Escape work; a clear button resets the filter.
- **Selection:** `feature-state` highlight plus a URL param `?f={icao24}`, so a selected flight can be linked. The panel is a right sidebar on desktop and a bottom sheet on mobile.
- **Accessibility:** a list view of aircraft in the viewport (sortable, keyboard-navigable) as an alternative to the map. The selected-flight panel is a focus-managed dialog region.
- **States:** loading skeleton; `waking` ("Waking up the live data service…" while the free-tier API cold-starts); `live`; `demo` (badge); `degraded` (stale snapshot, with a banner); `unavailable` (basemap and airports still shown, with the API's explanation of why the sources failed, the time of the last check in IST, "Checking again automatically" and a **Check now** button). Unreachable and expired states show the same check time and button.

## Visual system

- Dark-first. Tokens are CSS variables: navy and charcoal surfaces, white and muted-grey text, one cyan accent, a semantic amber for warnings and stale data, and a red reserved for errors. A light theme is supported by the tokens but is secondary.
- Typography: Geist (sans) and Geist Mono for codes and numbers (IATA, callsigns, altitudes), with tabular figures.
- Semantic colour tokens: `primary` (cyan), `success` (verified), `warning` (stale, unverified, outdated), `destructive` (errors only).
- Restraint: hairline borders, minimal shadow, no decorative gradients or glass. Motion only for state changes (panel open, selection), and it respects `prefers-reduced-motion`.
- Contrast is checked against WCAG AA in both themes.
