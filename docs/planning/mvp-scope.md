# MVP scope

Last updated: 2026-11-13. Requirement IDs refer to the [PRD](./product-requirements.md).

## In scope

| Area | Included | Requirement IDs |
|---|---|---|
| Shell | Header, five-item nav, footer, theming (dark-first), loading, error and empty states | — |
| Home | Hero search, live map entry, popular airports, featured guides, lounge and card entry points | HOME-1, 2, 3, 5 |
| Live map | MapLibre map, aircraft layer, selection panel, search, airline filter, source and demo badge, staleness, polling | LIVE-1 to 5, 7 to 10, LIVE-6 (airline) |
| Flight page | `/flight/[id]` backed by an on-demand operational provider if one is configured. Otherwise positions only, with an explicit notice | FLT-1 to 4 |
| Airports | Directory and detail pages for **7 airports** (DEL, BOM, BLR, HYD, MAA, COK, JAI) | APT-1 to 4, 6 |
| Lounges | Directory and detail pages for lounges at those 7 airports, **only where verified data exists** | LNG-1 to 3 |
| Cards | Directory, detail, eligibility checker. Start with a small set of cards (target 10–20) verified from issuer MITCs rather than broad, unverified coverage | CRD-1, 2, 4, 5 |
| API | REST v1 for all of the above, plus health | — |
| Data | Postgres + PostGIS schema, Alembic migrations, seed content with provenance, Redis position snapshot | — |
| Ops | Docker Compose local stack, GitHub Actions CI (lint, type check, tests), deploy configs | — |

## Out of scope for the MVP (backlog)

- Popular routes (HOME-4), unless a real source is chosen.
- Departure and arrival airport filters and status filter on the live map (LIVE-6). These depend on bulk operational data.
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
3. With live provider credentials missing, `/live` runs in labelled demo mode and every other page still works.
4. CI is green. Playwright smoke tests cover each route.
5. Docs are updated, including the implementation status in the README.
