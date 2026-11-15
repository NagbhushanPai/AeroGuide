# ADR-0015: Fare search from a paid API, within a hard request budget

- Status: Accepted (owner, 2026-11-15)
- Date: 2026-11-15

## Context
The owner wants fare search and comparison for Indian domestic flights. No open data source publishes fares: prices only come from airlines, booking sites and commercial APIs. AeroGuide's rules say open data and free tiers only ([ADR-0012](./0012-zero-budget-hosting.md), CONTRIBUTING rule 4).

[Ignav](https://ignav.com/docs) has a usable public API:
- One-way, round-trip and multi-leg fare search, plus booking links per itinerary.
- An Indian market (`market: IN`), which returns prices in INR. Checked with 3 requests on 2026-11-15.
- Pricing (checked 2026-11-15): 1,000 free requests **once, not monthly**, then $2 per 1,000. Only successful (HTTP 200) requests count. Fare searches, booking-link lookups and airport searches are all billable. There's no card until the free requests are used, and no published rate limits.

Coverage check on 2026-11-15 (one request per route, 6 Dec 2026):

| Route | Airlines returned |
|---|---|
| DEL-BOM | IndiGo, Air India, Air India Express, Akasa Air, SpiceJet |
| BLR-HYD | IndiGo, Air India Express, plus SriLankan via Colombo (not domestic) |
| CCU-GAU | IndiGo |

## Decision
1. **A scoped exception to the zero-budget rule:** Ignav is the only paid source, used only for fare search. Everything else stays open data.
2. **A hard request budget keeps it free by default.**
   - Every outgoing Ignav request, retries included, first reserves one unit. The counter is in Postgres (`provider_usage`, migration 0007) and is checked and incremented in one transaction under an advisory lock, so it holds across restarts and concurrent requests. If the counter can't be read, no request is sent.
   - Caps: `FARES_TOTAL_REQUEST_CAP=900` for the lifetime, below the 1,000 free requests and leaving room for the coverage script. `FARES_DAILY_REQUEST_CAP=100`. `FARES_MONTHLY_REQUEST_CAP` is optional, for when billing is on.
   - At **95%** of the cap (`FARES_BUDGET_WARN_RATIO`), every search response carries a gentle "Heads up: N of M fare searches used" message. The website shows it and the API logs a warning once.
   - At the cap, searches stop with a clear message (HTTP 429). Raising the cap is a deliberate config change.
3. **Requests are spent carefully:**
   - Results are cached for 10 minutes (`FARES_CACHE_TTL_S`) per route, dates, passengers, cabin and market. Filters and sorting run on cached results.
   - Booking links are fetched only when someone clicks Book.
   - Airport autocomplete uses AeroGuide's own airport list, never Ignav's billable airport search.
   - Non-Indian airports are refused before any request.
   - The other airports of a multi-airport city (DEL/DXN, BOM/NMI, GOI/GOX) are searched only when the traveller asks, at one request per extra pair.
   - `/api/v1/fares/*` has a tighter per-client rate limit (`FARES_RATE_LIMIT_PER_MINUTE=10`).
4. **Retries only for documented transient errors.** These are `unable_to_complete_request`, `server_busy`, `billing_period_unavailable`, other 5xx and network timeouts, at most 2 retries with backoff or `Retry-After`. A 4xx is never retried.
5. **Provider-agnostic design.** Providers implement `FlightProvider` (`search`, `booking_links`) and map to one normalised `Offer`. The search service asks every provider concurrently with a per-provider timeout, so one failing never fails the search. Adding a source is one adapter plus a registry entry.
6. **Domestic only.** Itineraries that touch an airport outside India, such as a connection via Colombo, are left out, and the response says how many.
7. **Honesty.** Results say prices can change and that the seller confirms them, and unverified prices are labelled. The demo provider (`FARE_PROVIDERS=mock`) is for tests and offline demos only, runs on its own, and every offer and page is labelled demo ([ADR-0011](./0011-demo-mode-is-explicit.md)).

## Consequences
- Fare search costs nothing until 900 requests are used, then pauses until the owner raises the cap and adds billing at Ignav.
- On a busy day the daily cap may pause searches until midnight IST, which is preferable to an unexpected bill.
- Coverage depends on Ignav. In the check above, Akasa Air and SpiceJet appeared on DEL-BOM but not on BLR-HYD or CCU-GAU. The coverage script (`apps/api/scripts/check_ignav_coverage.py`, 3 requests) can re-check this; run it rarely.
- Ignav's terms of use apply to displaying and caching its results; review them before a public launch.
