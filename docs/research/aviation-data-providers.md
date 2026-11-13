# Aviation data provider comparison

Researched 2026-11-13. Prices and limits change often. **Re-check every figure on the provider's own pricing page before signing up.** Figures marked † come from third-party summaries and are unconfirmed.

## Two different kinds of data

AeroGuide needs two kinds of data that usually come from different providers:

| Data class | Examples | Typical source |
|---|---|---|
| **Surveillance (positions)** | lat/lon, altitude, ground speed, track, squawk, ICAO 24-bit address, ADS-B callsign | ADS-B receiver networks |
| **Operational (schedule and status)** | flight number (AI101), scheduled and estimated departure and arrival, gate, terminal, status (scheduled, departed, landed, cancelled), delay | Airline and airport feeds, commercial aggregators |

ADS-B gives a **callsign** (for example `AIC101`), not a marketed **flight number** (`AI101`). Mapping one to the other, and getting a route from a callsign, needs operational data. Community callsign-to-route databases are often stale. Our own test on 2026-11-13 returned a route that didn't match the aircraft's heading. So:

> A route derived from a callsign lookup is labelled **"reported route"** and is never presented as a verified schedule.

## Candidates

| Provider | Data | Commercial use | Cost / limits | India coverage | Notes |
|---|---|---|---|---|---|
| **adsb.lol** | Positions with type and registration. REST: `/v2/point/{lat}/{lon}/{nm}`, `/v2/hex`, `/v2/callsign` | Not clearly stated. Data is **ODbL 1.0**, which needs attribution and share-alike on derived databases | Free. Rate limits are "dynamic based on load". The project says an API key (for feeders) will be required in future | Good. Tested 2026-11-13: dense traffic over India | Includes type and registration, unlike OpenSky's free API |
| **adsb.fi open data** | Positions | Check the terms | Free, rate-limited | Reasonable | A second community feed. 
| **OpenSky Network** | Positions (state vectors), flights by aircraft or airport (batch, delayed) | **Non-commercial or research only.** For-profit use needs written permission | Free credits per day (anonymous about 400; ours showed `X-Rate-Limit-Remaining: 396`). An India bbox call costs 4 credits, so about 100 calls a day anonymously | Good | Browser CORS is blocked, so it needs a server-side proxy (fine, we have one) |
| **FlightAware AeroAPI** | Positions, schedules, status, history, alerts | Personal tier: personal or academic only. Standard and up: business | Usage-based per result set. Personal has no minimum (free monthly credit†). **Standard from $100/month**, **Premium from $1,000/month** | Global, strong | Mature, well documented. Strongest candidate for flight status |
| **Flightradar24 API** | Live positions by bbox, callsign or route; flight summaries | By plan terms | Plans: Explorer, Essential, Advanced. Entry about $9/month†. Credits per call. Free sandbox key | Global, strong | Separate from consumer FR24 Premium |
| **AeroDataBox** | Flight status, airport schedules, aircraft | Via RapidAPI or API.market plans | Freemium (about 600 units/month free†). Status endpoints are "Tier 2" (paid) | Coverage is published per airport through the API. **Indian airport coverage not yet confirmed** | Calls itself "best-effort". No SLA |
| **aviationstack (apilayer)** | Real-time flights, schedules, timetable | Free plan has a personal license | Free: **100 requests/month**, 1 request per 60 s on timetable and future endpoints. Paid tiers above that | Global, quality varies | The free tier is too small to use beyond a demo |
| **Cirium / OAG** | Licensed schedules and status | Enterprise | Sales-led, expensive | Comprehensive | Long-term option once revenue justifies it |
| **adsbdb.com** | Callsign → route, aircraft by hex | Check the terms | Free | Partial | **Community route data. Treat as unverified** |

## Recommendation

**Phased approach behind a provider interface** (see [ADR-0004](../decisions/0004-flight-provider-abstraction.md)):

| Phase | Positions | Schedule/status | Gate |
|---|---|---|---|
| Development | `DemoProvider` (synthetic, always labelled DEMO) plus adsb.lol | none | — |
| MVP (non-commercial or beta) | adsb.lol primary, OpenSky fallback | FlightAware AeroAPI *Personal* **or** AeroDataBox free tier, for flight detail lookups only (on demand, cached) | We must confirm we qualify as non-commercial and check that adsb.lol's ODbL attribution is shown |
| Production (commercial) | FR24 API or AeroAPI Standard, or a licensed adsb.lol / OpenSky agreement | FlightAware AeroAPI Standard | Budget approval |

Why:

1. Free community ADS-B feeds give real positions over India today at no cost.
2. Schedule and status data is where the free options break down. We call it **on demand** when a user opens a flight, never in bulk, and cache it, which keeps paid usage low.
3. The provider interface lets us swap any row without touching business logic.

## Open questions before Stage 4

1. **Is AeroGuide commercial?** Ads, affiliate links or a company owner all count. The answer rules out OpenSky and the Personal tiers, and changes the cost picture. *(Unresolved: owner decision.)*
2. Does adsb.lol permit our use case, and how should ODbL share-alike apply to any position history we store? Contact the project.
3. Which Indian airports does AeroDataBox cover? Check with its coverage endpoint.
4. What is the monthly budget for flight-status calls?

## Sources

- OpenSky API docs: https://openskynetwork.github.io/opensky-api — terms: https://opensky-network.org/about/terms-of-use
- adsb.lol API: https://github.com/adsblol/api — docs: https://api.adsb.lol/docs — historical data (ODbL): https://www.adsb.lol/docs/open-data/historical/
- adsb.fi open data: https://github.com/adsbfi/opendata
- FlightAware AeroAPI: https://flightaware.com/commercial/aeroapi/
- Flightradar24 API: https://www.flightradar24.com/blog/b2b/how-to-get-started-with-the-flightradar24-api/ — FAQ: https://support.fr24.com/support/solutions/folders/3000022922
- aviationstack pricing: https://aviationstack.com/pricing — changelog: https://docs.apilayer.com/changelog/docs/aviationstack
- AeroDataBox (third-party summaries): https://geekflare.com/dev/flight-data-api/
- Live tests run 2026-11-13 against the adsb.lol, OpenSky and adsbdb public endpoints
