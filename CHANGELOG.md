# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added (Stage 5a + 5b: lounges and cards)
- Database (migration 0004): amenities, access programmes, lounges with amenities and acceptance windows, banks, card networks, cards, and versioned lounge policies with typed rules. Policy versions and acceptance windows can't overlap.
- Seed format for lounges (`data/lounges/{IATA}.yaml`) and cards (`data/cards/*.yaml`), validated across files. 5 issuers and 5 card networks seeded; no lounges or cards yet (they need checking against official pages).
- Eligibility engine (`app/eligibility`): pure and rule-based. Answers yes, no or depends, with the check behind each answer. Table-driven tests for every rule type plus property-based tests (Hypothesis).
- API: `GET /lounges`, `/lounges/{slug}`, `/cards`, `/cards/{slug}`, `/access-programs`, and `POST /eligibility` (unknown fields rejected, nothing stored).
- Web: `/lounges`, `/lounges/[slug]`, `/cards` (checker plus cards by issuer), `/cards/[slug]` (version history), and a lounges section on airport guides. The checker keeps everything in page memory only.
- Contributor guide for lounges and cards, and the launch-set research checklist.

### Added (terminals and airlines from open data)
- Terminals as mapped in OpenStreetMap: `scripts/build_osm_terminals.py` builds `apps/api/data/osm_terminals.yaml` (92 passenger terminals at 66 airports), seeded into a new `osm_terminals` table, unverified and credited to OpenStreetMap contributors (ODbL). Shown on airport guides apart from verified terminals.
- Airlines seen at each airport: the live service records aircraft with airline callsigns on the ground or below 3,000 ft within 6 km of an airport, once per aircraft, airline, airport and IST day (`airport_sightings`, kept 45 days). `GET /api/v1/airports/{code}/airlines-seen?days=7` and an "Airlines seen here" section on guides, with the method and its gaps stated.

### Added (Stage 3: airports)
- Database: sources, source checks, record sources, airports, terminals, airlines and terminal airlines (migration 0002), each fact-bearing table with provenance and a "verified needs evidence" check.
- Seed content in `apps/api/data/`: 116 Indian airports with scheduled service (OurAirports geodata, marked unverified), sources, and guide files for DEL, BOM, BLR, HYD, MAA, COK and JAI with their official websites. No terminals yet: they need checking against official sources.
- Seed loader (`pnpm seed`, `pnpm seed:check`): validates every schema and provenance rule, upserts idempotently, removes deleted content.
- API: `GET /api/v1/airports` (typo-tolerant search, region and guide filters) and `GET /api/v1/airports/{code}` (IATA or ICAO, with provenance).
- Web: airport directory (`/airports`) and guide pages (`/airports/DEL`) with verification status and sources on every record. Airport search and airport cards on the live map; guides link back with `/?airport=DEL`.
- Weekly data check workflow: review queue, source link and content-change checks, seed validation and provider checks, reported in one `data-check` issue.
- Deploy data workflow: migrations and seed on changes to `main` (needs the `DATABASE_URL` secret).

### Changed
- `scripts/build_airports_geojson.py` is now `scripts/build_airport_data.py` and writes the map layer and the airport seed from the same rows.

### Added
- adsb.fi as a second community position source (`POSITION_PROVIDERS=adsblol,adsbfi,opensky`). A sweep now fails if more than 2 of its 10 regions are missing, instead of showing a partial map.

### Fixed
- Provider failures are logged with the error type (some network errors have empty messages).

### Added (live map, Stage 4 pulled forward)
- The homepage is now a full-screen live flight map: sidebar list with search and From/To filters, selected-flight panel (reported route, progress, estimated arrival, all missing fields shown as "Not available"), live status with source and age, IST clock.
- Layers: traffic, airports (OurAirports, public domain), weather radar (RainViewer). Basemap from OpenFreeMap, following the theme.
- Watch a flight: on-page and browser alerts for take-off, landing and coverage loss while the tab is open (stored in the browser).
- API: `GET /api/v1/positions` and `GET /api/v1/positions/{icao24}`. adsb.lol (primary) and OpenSky (fallback) providers, demo provider (explicit only), adsbdb reported routes with plausibility check, on-demand snapshot with stale-while-revalidate, Redis warm start, rate-limit backoff.
- Generated TypeScript API types (`pnpm --filter web gen:api`). Mocked-API e2e tests for the live map.

### Changed
- `/live` redirects to `/`. The previous homepage content is at `/about`. Navigation: Live Map, Airports, Lounges, Cards, About.
- Live threshold is 90 s (upstream refreshes once a minute to respect adsb.lol's 10 requests/minute limit).


### Added (Stage 2: design system)
- Dark-first theme with a remembered light/dark toggle (`next-themes`), `success` and `warning` tokens.
- Mobile navigation sheet. Header with inline nav on larger screens.
- Data-honesty components: `SourceBadge`, `VerificationStatus`, `DemoBadge`, `StaleIndicator`, `Field`/`NotAvailable`, `RelativeTime`, `ErrorState`, `PageSkeleton`, plus a shared client clock (`useNow`) and tested freshness helpers.
- Homepage sections (features, airport guides, lounges and cards, data legend) with honest empty states. Root loading state.
- `/design-system` reference page (unlinked, `noindex`).
- axe accessibility checks for every route in both themes. Mobile menu and theme toggle e2e tests.

### Changed
- Homepage search deferred to Stages 3–4, when real search exists.

### Added (Stage 1: foundation)
- pnpm workspace, Makefile with matching pnpm scripts, `.gitattributes`, `.editorconfig`, `.env.example` files.
- `apps/web`: Next.js 16 (App Router, Cache Components), Tailwind CSS v4, shadcn/ui (Radix), Lucide, TanStack Query provider, dark navy theme tokens, header, nav, footer, placeholder pages for every nav item, not-found and error pages, Vitest and Playwright smoke tests.
- `apps/api`: FastAPI app factory, settings, JSON logging, async SQLAlchemy engine, Redis client, `GET /api/v1/health` (database, PostGIS, Redis), Alembic with a first migration enabling `postgis`, `pg_trgm` and `btree_gist`, ruff, mypy and pytest, Dockerfile.
- `docker-compose.yml` (PostGIS 17-3.7, Redis 7.4), GitHub Actions CI (web, API with service containers, secret scan), local development guide.

### Removed
- Leftover prototype file `public/js/data.js`.

### Added (Stage 0)
- Stage 0 documentation: reference analysis, provider and data-source research, PRD, MVP scope, roadmap, backlog, implementation plan, architecture, database ERD, schema and data dictionary, API draft, testing strategy, ADRs 0001–0013.
- MIT licence.

### Changed
- Planning updated for the owner's decisions: non-commercial, zero budget, open data only, weekly data-check job.
