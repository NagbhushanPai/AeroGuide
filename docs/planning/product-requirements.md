# AeroGuide: product requirements document

| | |
|---|---|
| Status | Draft for approval (Stage 0) |
| Last updated | 2026-11-13 |
| Scope | India first, global later |
| Constraints | **Non-commercial. Zero budget. Open data sources only** (owner decision, 2026-11-13) |

## 1. Problem

Indian air travellers piece together flight status, the terminal their airline uses, which lounge they can get into, and whether their credit card covers it, from several places: airline apps, airport sites, bank MITC PDFs, forums. That information changes often and is rarely dated or sourced.

## 2. Product

AeroGuide is an aviation and airport intelligence site for India that combines:

1. Live flight tracking on a map.
2. Flight information and status.
3. Airport guides (terminals, airlines, food, shops, transport, facilities).
4. Lounge discovery.
5. Credit-card lounge eligibility, evaluated by deterministic, versioned rules.

**Principle: every fact is real, sourced and dated, or clearly marked as unverified, unavailable or demo.**

## 3. Users

| Persona | Need | Key surfaces |
|---|---|---|
| Traveller (occasional) | "Which terminal? Where's my flight? Is there a lounge?" | Home search, airport page, flight page |
| Frequent flyer | "Which card gets me in this quarter? Which lounge is better?" | Cards, eligibility checker, lounges |
| Aviation enthusiast | "What's flying over me? What type is it?" | Live map |
| Person meeting someone | "When will their flight land?" | Flight page, live map |

## 4. Goals and non-goals

**Goals (this phase)**
- A production-quality, responsive site across five sections: Home, Live Flights, Airports, Lounges, Cards.
- Real live positions from open ADS-B networks. A clearly labelled demo mode for development.
- Runs entirely on free tiers ($0).
- Structured, sourced content with verification metadata.
- A deterministic eligibility engine with policy history.
- An architecture that can later expose services as AI tools.

**Non-goals (this phase)**
- A hosted AI chat or our own model. AI assistants can use AeroGuide's read-only MCP tools instead ([ADR-0014](../decisions/0014-mcp-server-for-ai-assistants.md)).
- User accounts, saved flights and push alerts (backlog).
- Booking, payments, affiliate checkout, ads or any other commercial use.
- Airline schedules, gates, delays, cancellations and punctuality (no open data source exists).
- Native mobile apps.
- Coverage outside India.

## 5. Functional requirements

IDs are referenced by the backlog and tests. **P0** = MVP, **P1** = MVP if time allows, **P2** = later.

### Homepage

> **Changed 2026-11-13 (owner):** the homepage **is** the live map (map-first, with a sidebar flight list). The overview content moved to `/about`. The hero search becomes the map's flight search.

| ID | Requirement | Pri |
|---|---|---|
| HOME-1 | Logo, primary nav, hero with a flight search (flight number, airport code or city). Search ships with real results: airports in Stage 3, flights in Stage 4 | P0 |
| HOME-2 | Quick entry to the live map | P0 |
| HOME-3 | Popular airports, featured airport guides, lounge discovery and card-checker entry points, all driven by DB data | P0 |
| HOME-4 | Popular routes. **Only shown if backed by a real data source.** Otherwise the section is hidden | P1 |
| HOME-5 | Footer: sections, data sources and attribution, disclaimer, about | P0 |

### Live flight tracker (`/live`)
| ID | Requirement | Pri |
|---|---|---|
| LIVE-1 | Full-screen MapLibre map over India with zoom, pan and controls | P0 |
| LIVE-2 | Aircraft symbols rotated by track, colour-coded by altitude | P0 |
| LIVE-3 | Select an aircraft to open the info panel (fields below) | P0 |
| LIVE-4 | Draw the route (origin → aircraft → destination) when a route is known, styled as "reported" if unverified | P0 |
| LIVE-5 | Search by callsign, flight number or registration | P0 |
| LIVE-6 | Filters: airline, departure airport, arrival airport, status | P0 (airline, observed state: airborne or on ground). P1 (departure and arrival airport, based on *reported* routes and labelled as such) |
| LIVE-7 | Always-visible data-source badge and last-updated time. **DEMO DATA** label whenever simulated data is shown | P0 |
| LIVE-8 | Stale handling. A position older than 90 s is labelled "Delayed" (upstream refreshes once a minute). Older than 5 min it is hidden | P0 |
| LIVE-9 | The map still works with no live data: basemap, airports layer, an empty state that explains why | P0 |
| LIVE-10 | Updates without reload (polling every 15 s, see [ADR-0005](../decisions/0005-live-updates-polling-first.md)) | P0 |
| LIVE-11 | A "waking up" state while the free-tier API cold-starts | P0 |
| LIVE-12 | Layers: airports (OurAirports) and weather radar (RainViewer), each credited | P1, built |
| LIVE-13 | Watch a flight: on-page and browser alerts for take-off, landing and coverage loss while the tab is open | P1, built |

**Info panel fields:** flight number, airline, aircraft type, origin, destination, current position, altitude, ground speed, heading, departure information, arrival information, estimated arrival, status, last updated.

With open data:
- Origin and destination are a **reported route** (community data), labelled as such.
- Departure and arrival *times* show **"Not available from open data sources"**.
- Status is the **observed state** (airborne, on ground, not currently tracked).
- Estimated arrival is computed from live position and speed, and labelled "estimated from live position".

**Nothing is inferred and shown as fact.**

### Flight details (`/flight/[id]`)
| ID | Requirement | Pri |
|---|---|---|
| FLT-1 | `[id]` = IATA flight number (for example `AI101`) or callsign | P0 |
| FLT-2 | Identification, airline, reported origin and destination, observed state, live position, aircraft, estimated arrival (from live data), route map, source, updated time | P0 |
| FLT-3 | Recent observed flights for that callsign (OpenSky first-seen and last-seen times, previous days) | P1 |
| FLT-5 | Scheduled and estimated departure and arrival, and duration: shown as **"Not available from open data sources"** | P0 |
| FLT-4 | 404 and "not found today" states | P0 |

### Airports (`/airports`, `/airport/[code]`)
| ID | Requirement | Pri |
|---|---|---|
| APT-1 | Directory with search by name, IATA code and city, and filter by city or region | P0 |
| APT-2 | Airport cards (code, name, city, terminal count, lounge count) | P0 |
| APT-3 | Detail page sections: overview, code and location, terminals, airlines by terminal, lounges, dining, shopping, transport, facilities, passenger info | P0 |
| APT-4 | Each section and record shows its source and verification date. Unverified or missing data is marked as such | P0 |
| APT-5 | Small live map of nearby traffic | P1 |
| APT-7 | "Flights observed yesterday" list (OpenSky movements), labelled with source and date | P1 |
| APT-6 | Initial airports: DEL, BOM, BLR, HYD, MAA, COK, JAI | P0 |

### Lounges (`/lounges`, `/lounge/[slug]`)
| ID | Requirement | Pri |
|---|---|---|
| LNG-1 | Search by airport. Filter by terminal, domestic or international, and amenities | P0 |
| LNG-2 | Detail: name, airport, terminal, floor or location, nearest gate (if verified), hours, domestic or international, amenities, food and beverage, access methods, paid entry (if verified), source and verification date | P0 |
| LNG-3 | Access methods show **acceptance** only, with a link to "check if your card is eligible" | P0 |

### Cards (`/cards`, `/cards/[slug]`, `/cards/eligibility`)
| ID | Requirement | Pri |
|---|---|---|
| CRD-1 | Search. Filter by bank, network, and domestic or international benefit | P0 |
| CRD-2 | Detail: bank, card, variant, network, domestic and international visits, spend requirement, guest rules, limits, entry method, programme, effective date, source and verification date, policy history | P0 |
| CRD-3 | Compare 2–4 cards side by side | P1 |
| CRD-4 | Eligibility checker. Inputs: card (+ variant), airport or lounge, travel date, domestic or international, optional spend and visits used. Output: `eligible`, `not_eligible`, `conditional` or `unknown`, with reasons, the policy version used, and sources | P0 |
| CRD-5 | **Never** asks for card numbers, CVV, PINs, OTPs or credentials | P0 |

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Content pages: LCP < 2.5 s on 4G mid-range Android. Live map: interactive < 3 s. 2,000 aircraft rendered at 60 fps on desktop (symbol layer, not DOM markers) |
| Accessibility | WCAG 2.2 AA. Keyboard-navigable lists as an alternative to the map. Colour is never the only signal |
| Responsive | 360 px to 1920 px. The live panel becomes a bottom sheet on mobile |
| SEO | Server-rendered airport, lounge and card pages with structured data |
| Security | No secrets in the frontend. Provider keys server-side only. Rate limiting on public API. OWASP ASVS L1 baseline |
| Reliability | Content pages are static or ISR and work if the API is asleep or a data source is down. The live page degrades to a "waking", "delayed" or "unavailable" state with an explanation |
| Cost | $0. Free tiers only ([ADR-0012](../decisions/0012-zero-budget-hosting.md)) |
| Data freshness | A weekly automated data check ([ADR-0013](../decisions/0013-weekly-data-check.md)) |
| Data integrity | Provenance on every mutable record (see [ADR-0006](../decisions/0006-content-provenance-and-verification.md)) |
| Observability | Structured logs, provider health and freshness metrics, error tracking |

## 7. Success metrics (measured after launch, not invented)

- Share of airport, lounge and card records that are `verified` and within their re-verify window. Target ≥ 90%.
- Live data freshness: p95 age of displayed positions < 30 s.
- Eligibility checks that return `unknown` (an indicator of data gaps).
- Core Web Vitals pass rate.

## 8. Constraints and dependencies

- Flight data is limited to open sources (adsb.lol, OpenSky, adsbdb), with their attribution and licence terms. See [provider research](../research/aviation-data-providers.md).
- Content accuracy depends on re-verification by a person, prompted by the weekly data check.
- Free-tier limits (cold starts, database size, Redis command cap) shape the design ([ADR-0012](../decisions/0012-zero-budget-hosting.md)).
- The tech stack is fixed by the project brief (see [system architecture](../architecture/system-architecture.md)).
