# Feature backlog

Last updated: 2026-11-13. Ordered by priority within each group. **P0** = MVP, **P1** = MVP if time allows, **P2** = post-MVP.

## Live flights
| Item | Pri | Depends on |
|---|---|---|
| Aircraft symbol layer, rotation, altitude colours | P0 | Positions API |
| Selection panel and reported-route line | P0 | Route lookup |
| Callsign, registration and flight-number search | P0 | — |
| Airline filter (from callsign ICAO prefix → airlines table) | P0 | Airlines seed |
| Source badge, DEMO DATA label, staleness | P0 | — |
| Airports overlay layer | P0 | Airports API |
| Observed-state filter (airborne, on ground) | P0 | — |
| Departure and arrival airport filters | P1 | Reported routes (labelled) |
| Position trails (last 15 min, in memory) | P1 | Trail ring buffer |
| Delay and cancellation status | **Not possible** | No open data source |
| SSE push updates | P2 | ADR revisit |
| Watch list and alerts | P2 | Accounts or local storage |
| Satellite or 3D view | P2 | — |

## Flights
| Item | Pri |
|---|---|
| `/flight/[id]` with live state, reported route, estimated arrival | P0 |
| "Not available from open data sources" for schedule fields | P0 |
| Recent observed flights (OpenSky) | P1 |
| Scheduled times, gates, punctuality | **Not possible** with open data |
| Per-flight SEO pages | P2 |

## Airports
| Item | Pri |
|---|---|
| Directory, search and filters | P0 |
| Detail sections with provenance | P0 |
| Nearby-traffic mini map | P1 |
| "Flights observed yesterday" (OpenSky movements) | P1 |
| Terminal maps | P2 |
| More airports (CCU, AMD, GOI, GOX, PNQ, LKO, GAU, TRV, IXC, …) | P2 |

## Lounges
| Item | Pri |
|---|---|
| Directory, filters, detail | P0 |
| "Can I get in?" deep link to the eligibility checker, prefilled | P0 |
| Lounge comparison within an airport | P2 |

## Cards
| Item | Pri |
|---|---|
| Directory, filters, detail, policy history | P0 |
| Eligibility engine and checker | P0 |
| Comparison (2–4 cards) | P1 |
| "Best card for this lounge" reverse lookup | P2 |

## Platform
| Item | Pri |
|---|---|
| Provenance validation in the seed loader (rejects records without a source) | P0 |
| Weekly data-check workflow: staleness, source links and content changes, seed validation, provider smoke checks, GitHub issue | P0 |
| Optional twice-weekly Supabase keep-alive | P1 (owner decision) |
| Rate limiting on public API | P0 |
| Error tracking and provider freshness metrics | P1 |
| Admin CMS | P2 |
| i18n (Hindi and others) | P2 |
| AI tool layer | Future phase |
