# Frontend architecture

Last updated: 2026-11-13. Status: proposed.

## Stack

Next.js (App Router), TypeScript strict, Tailwind CSS, shadcn/ui (Radix primitives), Lucide icons, MapLibre GL JS, TanStack Query. The API client and types are generated from FastAPI's OpenAPI schema (`openapi-typescript` + `openapi-fetch`), so a contract change breaks the type check instead of failing at runtime.

## Route map

| Route | Rendering | Data |
|---|---|---|
| `/` | Server component, ISR (revalidate 1 h) | Featured airports, lounges and cards from the API |
| `/live` | Server shell + **client-only** map (`dynamic(..., { ssr: false })`) | Positions polled through TanStack Query |
| `/flight/[id]` | Server component, revalidate 60 s, with client refresh | Flight service |
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

| Component | Behaviour |
|---|---|
| `SourceBadge` | Source name + link + "updated {relative time}". Required on any page showing changeable data |
| `VerificationStatus` | `verified` (with date), `unverified`, `outdated` (past its re-verify date) or `unavailable` |
| `DemoBadge` | Prominent "DEMO DATA" pill. Rendered whenever the response has `meta.mode = "demo"` |
| `StaleIndicator` | Fades or labels data older than the thresholds |
| `Field` | Renders "Not available" for `null`. Never `0` or an empty string as a placeholder |

## Live map design

- **Rendering:** one GeoJSON source, `aircraft`, rendered as a **symbol layer** (SDF plane icon, `icon-rotate: ['get','track']`, `icon-rotation-alignment: map`, colour from an altitude expression). This handles thousands of aircraft on the GPU. DOM markers are avoided.
- **Update loop:** `usePositions(bbox)` with a 10 s `refetchInterval`, paused when the tab is hidden. Each update calls `source.setData()`. Optional client-side dead reckoning between polls, applied only to positions under 30 s old.
- **Selection:** `feature-state` highlight plus a URL param `?f={icao24}`, so a selected flight can be linked. The panel is a right sidebar on desktop and a bottom sheet on mobile.
- **Accessibility:** a list view of aircraft in the viewport (sortable, keyboard-navigable) as an alternative to the map. The selected-flight panel is a focus-managed dialog region.
- **States:** loading skeleton; `live`; `demo` (badge); `degraded` (stale snapshot, with a banner); `unavailable` (basemap and airports still shown, with an explanation).

## Visual system

- Dark-first. Tokens are CSS variables: navy and charcoal surfaces, white and muted-grey text, one cyan accent, a semantic amber for warnings and stale data, and a red reserved for errors. A light theme is supported by the tokens but is secondary.
- Typography: one sans (for example Inter or Geist) and one mono for codes and numbers (IATA, callsigns, altitudes), with tabular figures.
- Restraint: hairline borders, minimal shadow, no decorative gradients or glass. Motion only for state changes (panel open, selection), and it respects `prefers-reduced-motion`.
- Contrast is checked against WCAG AA in both themes.
