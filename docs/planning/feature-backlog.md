# Feature backlog

Last updated: 2026-11-16. Ordered by priority within each group. **P0** = MVP, **P1** = MVP if time allows, **P2** = post-MVP. Status is as built on `main`.

## Live flights
| Item | Pri | Depends on | Status |
|---|---|---|---|
| Aircraft symbol layer, rotation, altitude colours | P0 | Positions API | Done |
| Selection panel and reported-route line | P0 | Route lookup | Done |
| Callsign, registration and flight-number search | P0 | — | Done (also type code, hex and route airports) |
| Airline filter (from callsign ICAO prefix → airlines table) | P0 | Airlines seed | Not started |
| Source badge, DEMO DATA label, staleness | P0 | — | Done |
| Airports overlay layer | P0 | Airports API | Done |
| Observed-state filter (airborne, on ground) | P0 | — | Not started |
| Departure and arrival airport filters | P1 | Reported routes (labelled) | Done (searchable From/To, reported routes) |
| Weather radar layer (RainViewer) and dead reckoning between updates | P1 | — | Done |
| Position trails (last 15 min, in memory) | P1 | Trail ring buffer | Not started |
| Delay and cancellation status | **Not possible** | No open data source | — |
| SSE push updates | P2 | ADR revisit | Not started (polling every 15 s) |
| Watch list and alerts | P2 | Accounts or local storage | Done (browser storage, while the tab is open) |
| Satellite or 3D view | P2 | — | Not started |

## Flights
| Item | Pri | Status |
|---|---|---|
| `/flight/[id]` with live state, reported route, estimated arrival | P0 | Not started (the map's flight panel shows these) |
| "Not available from open data sources" for schedule fields | P0 | Done in the flight panel |
| Recent observed flights (OpenSky) | P1 | Not started |
| Scheduled times, gates, punctuality | **Not possible** with open data | — |
| Per-flight SEO pages | P2 | Not started |

## Fares
| Item | Pri | Status |
|---|---|---|
| Fare search and comparison on Indian domestic routes (`/fares`, Ignav, request budget, [ADR-0015](../decisions/0015-paid-fare-search-with-a-request-budget.md)) | — | Done |

## Airports
| Item | Pri | Status |
|---|---|---|
| Directory, search and filters | P0 | Done |
| Detail sections with provenance | P0 | Done for the 7 guides (OpenStreetMap terminals and airlines seen as labelled substitutes; verified terminal assignments still to do) |
| Nearby-traffic mini map | P1 | Not started (guides link to the live map with the airport selected) |
| "Flights observed yesterday" (OpenSky movements) | P1 | Not started |
| Terminal maps | P2 | Not started |
| More airports (CCU, AMD, GOI, GOX, PNQ, LKO, GAU, TRV, IXC, …) | P2 | 116 airports in the directory (OurAirports geodata); guides only for the first 7 |

## Lounges
| Item | Pri | Status |
|---|---|---|
| Directory, filters, detail | P0 | Done (44 lounges at the 7 guide airports) |
| "Can I get in?" deep link to the eligibility checker, prefilled | P0 | Done |
| Lounge comparison within an airport | P2 | Not started |

## Cards
| Item | Pri | Status |
|---|---|---|
| Directory, filters, detail, policy history | P0 | Done (76 cards: 15 verified, 61 imported and unverified) |
| Eligibility engine and checker | P0 | Done |
| Comparison (2–4 cards) | P1 | Not started |
| "Best card for this lounge" reverse lookup | P2 | Done ("Cards that may get you in" on lounge pages) |

## Platform
| Item | Pri | Status |
|---|---|---|
| Provenance validation in the seed loader (rejects records without a source) | P0 | Done |
| Weekly data-check workflow: staleness, source links and content changes, seed validation, provider smoke checks, GitHub issue | P0 | Done |
| Optional twice-weekly Supabase keep-alive | P1 (owner decision) | Done |
| Rate limiting on public API | P0 | Done (REST, `/fares` and MCP limits) |
| Error tracking and provider freshness metrics | P1 | Partly: per-provider status in `/api/v1/health`; no error tracking |
| Admin CMS | P2 | Not started |
| i18n (Hindi and others) | P2 | Not started |
| AI tool layer | Future phase | Done: read-only MCP server with 12 tools ([ADR-0014](../decisions/0014-mcp-server-for-ai-assistants.md)) |
