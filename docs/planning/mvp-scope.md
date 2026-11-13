# MVP scope

Last updated: 2026-11-13. Requirement IDs refer to the [PRD](./product-requirements.md).

## In scope

| Area | Included | Requirement IDs |
|---|---|---|
| Shell | Header, five-item nav, footer, theming (dark-first), loading, error and empty states | — |
| Home | Hero search, live map entry, popular airports, featured guides, lounge and card entry points | HOME-1, 2, 3, 5 |
| Live map | MapLibre map, aircraft layer, selection panel, search, airline and observed-state filters, source and demo badge, staleness, polling, cold-start state | LIVE-1 to 5, 7 to 11, LIVE-6 (P0 part) |
| Flight page | `/flight/[id]` with live state, reported route and estimated arrival from open data. Schedule fields say "Not available from open data sources" | FLT-1, 2, 4, 5 |
| Airports | Directory and detail pages for **7 airports** (DEL, BOM, BLR, HYD, MAA, COK, JAI) | APT-1 to 4, 6 |
| Lounges | Directory and detail pages for lounges at those 7 airports, **only where verified data exists** | LNG-1 to 3 |
| Cards | Directory, detail, eligibility checker. Start with a small set of cards (target 10–20) verified from issuer MITCs rather than broad, unverified coverage | CRD-1, 2, 4, 5 |
| API | REST v1 for all of the above, plus health | — |
| Data | Postgres + PostGIS schema, Alembic migrations, seed content with provenance, Redis caches | — |
| Ops | Docker Compose local stack, GitHub Actions CI (lint, type check, tests), **weekly data-check workflow**, free-tier deploy configs ($0) | — |

## Out of scope for the MVP (backlog)

- Popular routes (HOME-4), unless a real source is chosen.
- Departure and arrival airport filters on the live map (LIVE-6, P1). These are based on reported routes.
- Recent observed flights (FLT-3) and "flights observed yesterday" on airport pages (APT-7): P1.
- **Not possible with open data:** schedules, gates, delays, cancellations, punctuality.
- Position history in Postgres (free-tier storage).
- Card comparison (CRD-3): P1, built if time allows.
- Airport mini live map (APT-5).
- Accounts, watch lists, alerts, notifications.
- Admin CMS (content is edited as reviewed seed files, see [ADR-0007](../decisions/0007-content-as-reviewed-seed-files.md)).
- WebSockets or SSE (polling first).
- 3D or satellite map modes.
- Any AI feature.
- Airports beyond the initial 7.

## MVP exit criteria

1. Every P0 requirement above meets the Definition of Done in the project brief.
2. No page shows a fabricated fact. Missing data appears as "Not yet verified" or "Not available".
3. If the open data sources are unreachable, `/live` shows an honest "unavailable" state and every other page still works. Demo mode works when it is explicitly enabled.
4. The whole stack runs on free tiers at $0.
5. CI is green. Playwright smoke tests cover each route. The weekly data check has run successfully at least once.
6. Docs are updated, including the implementation status in the README.
