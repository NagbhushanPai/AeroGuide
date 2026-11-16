# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed (live map that stays live)
- adsb.lol and adsb.fi now work as one pooled source that fails over **point by point**: when one network rate-limits a sweep, the remaining grid points go to the other and the points already fetched are kept, instead of restarting the sweep elsewhere. The pool sticks with whichever network answered last, and the map reports "adsb.lol + adsb.fi" as the source. Only when every network is resting does the sweep fall through to OpenSky.
- When the feed is down, the map says why ("the open data sources are busy" or "aren't responding"), shows when it last checked, and offers a **Check now** button. It still polls every 15 seconds, so no page reload is needed.
- Airborne aircraft move between updates: the map draws each plane where its reported speed and track would have taken it since its last position (dead reckoning, at most 75 s past the report, redrawn twice a second). The legend says these in-between positions are estimates. Off when `prefers-reduced-motion` is set or the data has expired (no update for 5 minutes).
- The flight list's From and To filters are searchable: type a code or a city and pick with the keyboard or a tap. Only airports in the current reported routes are listed, busiest first, with their flight counts.

### Added (fare search for AI assistants)
- MCP tool `search_flights`: Indian domestic fares, one way or round trip, with filters and sort. It returns the top 10 and a link to the website's fares page, where the traveller compares everything and books.
- Assistants' live searches have their own daily cap (`FARES_MCP_DAILY_REQUEST_CAP`, 20) inside the site's request budget. They share the website's 10-minute cache, and filter changes are free. There is no booking-link tool and no multi-airport search, so spending stays on the website.

### Added (fare search)
- Fare search and comparison for Indian domestic routes, one-way or round trip, from the Ignav API ([ADR-0015](docs/decisions/0015-paid-fare-search-with-a-request-budget.md)): `POST /api/v1/fares/search`, `POST /api/v1/fares/booking-links`, `GET /api/v1/fares/budget`, and the `/fares` page.
- Provider-agnostic design: providers implement one `FlightProvider` interface and map to a normalised offer. They're asked concurrently with per-provider timeouts, and one failing never fails the search. A demo provider (`FARE_PROVIDERS=mock`) gives labelled demo fares for tests and offline work.
- A hard request budget: every Ignav request, retries included, is counted in Postgres (migration 0007) under a lock and capped at 900 requests by default (below the 1,000 free ones) and 100 a day. Searches show a gentle reminder at 95%, and stop at the cap.
- Requests are spent carefully: a 10-minute result cache (filters and sorting reuse it), booking links fetched only on Book, airport autocomplete from AeroGuide's own data, non-Indian airports refused before any request, and a per-client limit on `/fares`.
- Itineraries connecting outside India (for example via Colombo) are left out of domestic results.
- `apps/api/scripts/check_ignav_coverage.py`: a 3-request airline coverage check, dry run by default.

### Changed (checker answers you can trust)
- Missing data is never "no": a card with no recorded benefit for the scope, a programme whose lounge list we don't have, and guests the terms don't mention now give "depends". A benefit that ended is still "no" ([ADR-0009](docs/decisions/0009-deterministic-eligibility-engine.md), revised).
- Informational rule types `fee` and `add_on_cardholders` (migration 0006) never change an answer. The 15 verified cards were remodelled with them, so a ₹2 authorisation fee no longer forces "depends": 9 of the 15 can now get a plain "yes".
- Lounges have a `direction` (departures, arrivals, transit). 5 arrivals lounges are no longer offered to departing passengers.
- A "no" shows only its deciding checks; programmes appear by name; quoted bank wording is folded behind "Show the bank's wording".
- Overlap constraints are deferrable, so editing a version's start date no longer breaks the seed.

### Added (lounge lists)
- 66 lounge acceptances at the 7 guide airports from HDFC's, ICICI's and Kotak's own participating-lounge lists. The Visa/Mastercard and Diners lists couldn't be read (one blocks automated access, one is app-only).

### Added (finding your way)
- Card picker with search and bank groups (chips, remembered in this browser only), airport search by city, airport/date/scope kept in the URL, results per lounge.
- Two-way links: "Cards that may get you in" on lounge pages, "Lounges this card opens" on card pages (`GET /cards/{slug}/lounges`), lounges on the map's airport card, breadcrumbs.
- Site search with Ctrl/Cmd-K over airports, lounges and cards (`GET /search`).
- Filters on the lounge and card directories, kept in the URL.
- Bottom tab bar on phones; map controls reflowed for 390 px; altitude legend; theme-aware map colours.

### Added (reach)
- Per-page titles, descriptions, canonical URLs, Open Graph image and JSON-LD; `sitemap.xml` and `robots.txt`; real 404s for unknown airports, lounges and cards; lowercase airport codes redirect.

### Changed (reliability)
- Live status says "Delayed" or "No recent data" when the feed is stale or failing, instead of "Live". Each provider gets at most 45 s, and a first request waits at most 10 s. `/health` reports each provider's last sweep.
- One "waking the server" message, and retries that outlast a 60 s cold start.
- Per-client rate limit on the REST API (120 a minute) keyed on the proxy-appended address, also fixing the MCP limiter; request bodies over 16 KB refused; database connect and command timeouts; Redis optional.
- Lounges and cards are cached in memory for 5 minutes, so eligibility needs no database round trip on a warm cache.
- "Airlines seen" measures height above the airport, so Bengaluru, Hyderabad and Leh are no longer under-counted.
- Twice-weekly database keep-alive workflow, so the free-tier database doesn't pause.

### Removed
- "Coming soon" placeholders on the About page, 14 unused sources, and dead components.

### Added (cards imported for checking)
- 61 more cards from 17 issuers, including 12 new ones (American Express, HSBC, AU, IndusInd, Yes Bank, RBL, Standard Chartered, BOBCARD, IDFC FIRST, Federal Bank, Niyo, Jupiter), imported from a third-party lounge tracker. Every one is marked unverified, cites the page the tracker relied on, and says it hasn't been checked by AeroGuide. Their policies carry the tracker's wording as unmodelled terms, so the checker answers "depends" for them, never "yes" (enforced by a test). They join the weekly review queue.

### Changed
- OpenSky uses an API client (OAuth2 client credentials) when `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` are set: a registered account's 4,000 daily credits instead of the anonymous per-IP allowance shared with other apps on the host. Tokens are cached and renewed before expiry or on a 401.

### Added (MCP server for AI assistants)
- `/mcp` on the API: a read-only Model Context Protocol server (official `mcp` SDK, Streamable HTTP, stateless). 11 tools cover airports, lounges, cards, the lounge access check and live flights, and return the same sourced results as the REST API. Any MCP client can connect, including Claude's free plan as a custom connector, at no cost to the project ([ADR-0014](docs/decisions/0014-mcp-server-for-ai-assistants.md), replacing ADR-0008).
- Per-client rate limit and Host allow-list on the MCP endpoint; `MCP_ENABLED`, `MCP_RATE_LIMIT_PER_MINUTE` and `MCP_ALLOWED_HOSTS` settings. Setup guide: [docs/api/mcp.md](docs/api/mcp.md).

### Fixed
- The lounge checker answered "no" when a bank's own lounge list wasn't recorded at all (HDFC, ICICI and Kotak domestic programmes). It now answers "depends" and says the list is missing.

### Added (Stage 5c: launch content)
- 15 cards, the top 3 travel cards of the 5 largest issuers: HDFC Bank (Infinia, Diners Club Black Metal, Regalia Gold), SBI Card (ELITE, PRIME, MILES ELITE), ICICI Bank (Emeralde, Sapphiro, Rubyx), Axis Bank (Atlas, Magnus, Horizon) and Kotak (White Reserve, Solitaire, Air+). Each policy cites the bank's own page or terms document. Unclear wording is marked ambiguous, so the checker answers "depends".
- 44 lounges at DEL, BOM, BLR, HYD, MAA, COK and JAI, from airport, operator and Priority Pass pages. Bank-run domestic programmes are linked to lounges from the banks' own participating-lounge lists (Axis and SBI Card).

### Changed
- A card's network is optional (migration 0005). Several banks don't say which network a card runs on, so the site shows "not stated" instead of guessing.

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
