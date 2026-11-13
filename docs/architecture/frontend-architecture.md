# Frontend architecture

Last updated: 2026-11-13. Status: proposed.

## Stack

Next.js (App Router), TypeScript strict, Tailwind CSS, shadcn/ui (Radix primitives), Lucide icons, MapLibre GL JS, TanStack Query. The API client and types are generated from FastAPI's OpenAPI schema (`openapi-typescript` + `openapi-fetch`), so a contract change breaks the type check instead of failing at runtime.

## Route map

| Route | Rendering | Data |
|---|---|---|
| `/` | **Live map** (homepage). Static shell + client-only map (`dynamic(..., { ssr: false })`) | Positions polled every 15 s through TanStack Query |
| `/about` | Static | What AeroGuide is, its sections, the data-label legend |
| `/live` | Redirects to `/` | — |
| `/flight/[id]` | Server shell + client refresh | Flight service (observed data only, open sources) |
| `/airports` | Server component, ISR. Search and filters in URL params | Airport search API |
| `/airport/[code]` | Server component, ISR + `generateStaticParams` for seeded airports | Airport detail API |
| `/lounges`, `/lounge/[slug]` | Same pattern | Lounge APIs |
| `/cards`, `/cards/[slug]` | Same pattern | Card APIs |
| `/cards/eligibility` | Server shell + client form | `POST /api/v1/eligibility` via a TanStack Query mutation |

Search and filter state lives in **URL search params**, so it can be shared, bookmarked and server-rendered.

## Proposed folder layout (`apps/web`)

```text
src/
├── app/                      # routes (layout.tsx, page.tsx, loading.tsx, error.tsx, not-found.tsx)
├── components/
│   ├── ui/                   # shadcn/ui generated primitives
│   ├── layout/               # Header, Nav, Footer, PageHeader
│   ├── data/                 # SourceBadge, VerificationStatus, DemoBadge, StaleIndicator, EmptyState
│   ├── map/                  # LiveMap, AircraftLayer, RouteLayer, AirportLayer, FlightPanel
│   ├── airports/ lounges/ cards/ flights/
├── lib/
│   ├── api/                  # generated client + typed wrappers
│   ├── query/                # QueryClient, keys, hooks (usePositions, useFlight, ...)
│   ├── format/               # units, IST times, durations
│   └── map/                  # style, icon sprite, altitude colour ramp
└── styles/                   # tokens (CSS variables), Tailwind config
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

## Homepage search

The hero flight search (HOME-1) is **deferred until there is real search behind it**. Airport search arrives in Stage 3 and flight search in Stage 4. A search box that only led to placeholders would break the "no non-functional controls" rule.

## Route groups

- `app/page.tsx` is the full-screen map (header only, no footer).
- `app/(site)/…` holds content pages with a scrolling layout and footer (`(site)/layout.tsx`).

## Live map design

Implemented in `src/components/live/`: `live-explorer.tsx` (layout and state), `live-map.tsx` (MapLibre), `flight-list.tsx` (sidebar with search and From/To filters), `flight-panel.tsx` (selected flight), `live-status.tsx` (mode, count, source, IST clock), `layer-toggles.tsx`, `alerts-menu.tsx` and `use-watchlist.ts` (watched flights).

- **Layers:** Traffic (aircraft), Airports (OurAirports public-domain data: 116 Indian airports with scheduled service, built by `scripts/build_airport_data.py` into `public/data/airports-in.geojson`, from the same rows as the API's airport seed), Weather (RainViewer radar tiles, free for personal and community use, credited on the map). Basemap: OpenFreeMap `dark` or `positron`, following the theme.
- **MapLibre 6 worker:** MapLibre 6 loads its web worker from a file next to its bundle, which Next.js doesn't emit. `scripts/copy-maplibre-worker.mjs` copies it to `public/vendor/` on `dev` and `build` (git-ignored), and the map calls `setWorkerUrl`.
- **Watch alerts:** star a flight to be told (on the page, and through browser notifications if allowed) when it takes off, lands, or drops out of or returns to coverage, while the tab is open. These are the only events ADS-B can show honestly. The list is stored in `localStorage`. Events are only computed from `live` data, so a feed outage doesn't look like every flight losing signal.

- **Rendering:** one GeoJSON source, `aircraft`, rendered as a **symbol layer** (SDF plane icon, `icon-rotate: ['get','track']`, `icon-rotation-alignment: map`, colour from an altitude expression). This handles thousands of aircraft on the GPU. DOM markers are avoided.
- **Update loop:** `usePositions()` with a 15 s `refetchInterval`, paused when the tab is hidden. The API itself refreshes upstream once a minute. Each update calls `source.setData()`. Optional client-side dead reckoning between polls, applied only to positions under 30 s old.
- **Selection:** `feature-state` highlight plus a URL param `?f={icao24}`, so a selected flight can be linked. The panel is a right sidebar on desktop and a bottom sheet on mobile.
- **Accessibility:** a list view of aircraft in the viewport (sortable, keyboard-navigable) as an alternative to the map. The selected-flight panel is a focus-managed dialog region.
- **States:** loading skeleton; `waking` ("Waking up the live data service…" while the free-tier API cold-starts); `live`; `demo` (badge); `degraded` (stale snapshot, with a banner); `unavailable` (basemap and airports still shown, with an explanation).

## Visual system

- Dark-first. Tokens are CSS variables: navy and charcoal surfaces, white and muted-grey text, one cyan accent, a semantic amber for warnings and stale data, and a red reserved for errors. A light theme is supported by the tokens but is secondary.
- Typography: Geist (sans) and Geist Mono for codes and numbers (IATA, callsigns, altitudes), with tabular figures.
- Semantic colour tokens: `primary` (cyan), `success` (verified), `warning` (stale, unverified, outdated), `destructive` (errors only).
- Restraint: hairline borders, minimal shadow, no decorative gradients or glass. Motion only for state changes (panel open, selection), and it respects `prefers-reduced-motion`.
- Contrast is checked against WCAG AA in both themes.
