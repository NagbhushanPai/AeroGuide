# MVP scope

Last updated: 2026-11-16. Requirement IDs refer to the [PRD](./product-requirements.md). Status is as built on `main`.

## In scope

| Area | Included | Requirement IDs | Status |
|---|---|---|---|
| Shell | Header, five-item nav, footer, theming (dark-first), loading, error and empty states | — | Done (six items now: Fares was added) |
| Home | Hero search, live map entry, popular airports, featured guides, lounge and card entry points | HOME-1, 2, 3, 5 | Changed: the homepage is the live map; the overview is at `/about`; site search (Ctrl/Cmd-K) covers airports, lounges and cards |
| Live map | MapLibre map, aircraft layer, selection panel, search, airline and observed-state filters, source and demo badge, staleness, polling, cold-start state | LIVE-1 to 5, 7 to 11, LIVE-6 (P0 part) | Done, except the airline and observed-state filters |
| Flight page | `/flight/[id]` with live state, reported route and estimated arrival from open data. Schedule fields say "Not available from open data sources" | FLT-1, 2, 4, 5 | Not built. The map's flight panel shows the same fields |
| Airports | Directory and detail pages for **7 airports** (DEL, BOM, BLR, HYD, MAA, COK, JAI) | APT-1 to 4, 6 | Done: 116 airports in the directory, guides for the 7. Verified terminal assignments still to do |
| Lounges | Directory and detail pages for lounges at those 7 airports, **only where verified data exists** | LNG-1 to 3 | Done: 44 lounges |
| Cards | Directory, detail, eligibility checker. Start with a small set of cards (target 10–20) verified from issuer MITCs rather than broad, unverified coverage | CRD-1, 2, 4, 5 | Done: 15 verified cards, plus 61 imported cards shown as unverified |
| API | REST v1 for all of the above, plus health | — | Done, plus fares and a read-only MCP server |
| Data | Postgres + PostGIS schema, Alembic migrations, seed content with provenance, Redis caches | — | Done (Redis optional; not yet connected in production) |
| Ops | Docker Compose local stack, GitHub Actions CI (lint, type check, tests), **weekly data-check workflow**, free-tier deploy configs ($0) | — | Done: live on Vercel, Render and Supabase |

Added after this scope was written: fare search on Indian domestic routes (`/fares`) from the Ignav API with a hard request budget ([ADR-0015](../decisions/0015-paid-fare-search-with-a-request-budget.md)).

## Out of scope for the MVP (backlog)

- Popular routes (HOME-4), unless a real source is chosen.
- ~~Departure and arrival airport filters on the live map (LIVE-6, P1).~~ Built: searchable From/To filters based on reported routes.
- Recent observed flights (FLT-3) and "flights observed yesterday" on airport pages (APT-7): P1, not built.
- **Not possible with open data:** schedules, gates, delays, cancellations, punctuality.
- Position history in Postgres (free-tier storage).
- Card comparison (CRD-3): P1, not built.
- Airport mini live map (APT-5): not built; guides link to the live map with the airport selected.
- Accounts, notifications. (Watching a flight for take-off, landing and coverage-loss alerts while the tab is open was built; it stores nothing outside the browser.)
- Admin CMS (content is edited as reviewed seed files, see [ADR-0007](../decisions/0007-content-as-reviewed-seed-files.md)).
- WebSockets or SSE (polling first).
- 3D or satellite map modes.
- ~~Any AI feature.~~ A read-only MCP server for AI assistants was built ([ADR-0014](../decisions/0014-mcp-server-for-ai-assistants.md)); no hosted chat or model.
- ~~Airports beyond the initial 7.~~ All 116 Indian airports with scheduled service are in the directory (OurAirports geodata, unverified); guides remain for the 7.

## MVP exit criteria

1. Every P0 requirement above meets the Definition of Done in the project brief. Open: the flight page (FLT-1, 2, 4, 5) and the airline and observed-state filters (LIVE-6).
2. No page shows a fabricated fact. Missing data appears as "Not yet verified" or "Not available".
3. If the open data sources are unreachable, the live map (`/`) shows an honest "unavailable" state and every other page still works. Demo mode works when it is explicitly enabled.
4. The whole stack runs on free tiers at $0.
5. CI is green. Playwright smoke tests cover each route. The weekly data check has run successfully at least once.
6. Docs are updated, including the implementation status in the README.
