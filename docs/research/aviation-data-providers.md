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
| **adsb.fi open data** | Positions | Check the terms | Free, rate-limited | Reasonable | A second community feed |
| **OpenSky Network** | Positions (state vectors), flights by aircraft or airport (batch, delayed) | **Non-commercial or research only.** For-profit use needs written permission | Free credits per day (anonymous about 400; ours showed `X-Rate-Limit-Remaining: 396`). An India bbox call costs 4 credits, so about 100 calls a day anonymously | Good | Browser CORS is blocked, so it needs a server-side proxy (fine, we have one) |
| **FlightAware AeroAPI** | Positions, schedules, status, history, alerts | Personal tier: personal or academic only. Standard and up: business | Usage-based per result set. Personal has no minimum (free monthly credit†). **Standard from $100/month**, **Premium from $1,000/month** | Global, strong | Mature, well documented. Strongest candidate for flight status |
| **Flightradar24 API** | Live positions by bbox, callsign or route; flight summaries | By plan terms | Plans: Explorer, Essential, Advanced. Entry about $9/month†. Credits per call. Free sandbox key | Global, strong | Separate from consumer FR24 Premium |
| **AeroDataBox** | Flight status, airport schedules, aircraft | Via RapidAPI or API.market plans | Freemium (about 600 units/month free†). Status endpoints are "Tier 2" (paid) | Coverage is published per airport through the API. **Indian airport coverage not yet confirmed** | Calls itself "best-effort". No SLA |
| **aviationstack (apilayer)** | Real-time flights, schedules, timetable | Free plan has a personal license | Free: **100 requests/month**, 1 request per 60 s on timetable and future endpoints. Paid tiers above that | Global, quality varies | The free tier is too small to use beyond a demo |
| **Cirium / OAG** | Licensed schedules and status | Enterprise | Sales-led, expensive | Comprehensive | Long-term option once revenue justifies it |
| **adsbdb.com** | Callsign → route, aircraft by hex | Check the terms | Free | Partial | **Community route data. Treat as unverified** |

## Decision constraints (owner, 2026-11-13)

- **AeroGuide is non-commercial.**
- **Zero budget.** Only open, free data sources.

So FlightAware AeroAPI, Flightradar24, AeroDataBox, aviationstack and Cirium/OAG are **excluded**. They stay in the table above for reference only. The provider interface still lets one be added later without touching business logic ([ADR-0004](../decisions/0004-flight-provider-abstraction.md)).

## Recommendation (open data only)

| Need | Source | How it is used |
|---|---|---|
| Live positions | **adsb.lol** (primary), **OpenSky Network** (fallback), adsb.fi (second fallback, once its terms are checked) | Fetched on demand by the API while people are viewing the map, refreshed at most once a minute ([ADR-0012](../decisions/0012-zero-budget-hosting.md)) |
| Aircraft type and registration | adsb.lol fields (`t`, `r`) | Shown as broadcast or derived by the network |
| Callsign → route | adsbdb.com (community) | Shown only as a **"reported route"**, with its source. Hidden when the aircraft's track contradicts it |
| Observed departures and arrivals per airport | **OpenSky `/flights/departure` and `/flights/arrival`** (batch, previous-day data, interval ≤ 7 days, needs a free account and OAuth2 client credentials) | Airport pages: "flights observed yesterday". Flight pages: observed first-seen and last-seen times for recent days |
| Demo | `DemoProvider` | Development and tests only, always labelled DEMO ([ADR-0011](../decisions/0011-demo-mode-is-explicit.md)) |

### What open data cannot provide

There is **no open source for airline schedules or operational status** in India. So AeroGuide will **not** show:

- scheduled or airline-estimated departure and arrival times,
- gates, check-in counters or baggage belts,
- delays and cancellations, or punctuality.

These fields show **"Not available from open data sources"**. The only status shown is the **observed state** from ADS-B: *airborne*, *on ground*, *not currently tracked*. Estimated arrival is calculated from live position and ground speed, and labelled "estimated from live position".

### Rate-limit budget

| Source | Limit | Our use |
|---|---|---|
| adsb.lol | **Observed 2026-11-13: 10 requests per rolling minute** (the 11th gets `429` with `Retry-After`) | One India sweep of exactly 10 point queries, 1 s apart, at most once a minute, only while someone is viewing. `429` is honoured |
| OpenSky (registered free account) | Daily credit allowance. An India bbox costs 4 credits | Fallback only. Airport departure and arrival batch calls run once a day |
| adsbdb | Not published | Cached 6 h per callsign. Called only when a user selects a flight |

### Other open data used

| Data | Source | Licence / terms |
|---|---|---|
| Airport coordinates and codes for the map layer | OurAirports | Public domain |
| Weather radar layer | RainViewer public API | Free for personal, educational and community use, with attribution |
| Basemap | OpenFreeMap (OpenMapTiles, OpenStreetMap) | Free, attribution to OpenStreetMap contributors |

## Open questions

1. Does adsb.lol's ODbL licence and its terms fit our use (display plus short-lived caching, no redistribution of a database)? Ask the project.
2. Check adsb.fi's open data terms before enabling it.
3. Register an OpenSky account and confirm the current daily credit allowance.

## Sources

- OpenSky API docs: https://openskynetwork.github.io/opensky-api — terms: https://opensky-network.org/about/terms-of-use
- adsb.lol API: https://github.com/adsblol/api — docs: https://api.adsb.lol/docs — historical data (ODbL): https://www.adsb.lol/docs/open-data/historical/
- adsb.fi open data: https://github.com/adsbfi/opendata
- FlightAware AeroAPI: https://flightaware.com/commercial/aeroapi/
- Flightradar24 API: https://www.flightradar24.com/blog/b2b/how-to-get-started-with-the-flightradar24-api/ — FAQ: https://support.fr24.com/support/solutions/folders/3000022922
- aviationstack pricing: https://aviationstack.com/pricing — changelog: https://docs.apilayer.com/changelog/docs/aviationstack
- AeroDataBox (third-party summaries): https://geekflare.com/dev/flight-data-api/
- Live tests run 2026-11-13 against the adsb.lol, OpenSky and adsbdb public endpoints
