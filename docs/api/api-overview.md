# API overview (v1)

Last updated: 2026-11-16. Rows marked **Implemented** match the code; the rest are proposals. The generated OpenAPI spec at `/api/v1/openapi.json` (interactive docs at `/api/v1/docs`) is the source of truth for implemented endpoints.

## Conventions

- Base path `/api/v1`. JSON only. `snake_case` fields.
- List endpoints return `{ "items": [...] }`. Only `/airports` pages: `?limit=` (default 50, max 200) and `?offset=`, with `total`, `limit` and `offset` in the response. There is no cursor pagination.
- Any response containing changeable facts includes provenance per record:
  ```json
  "provenance": {
    "status": "verified",            // verified | outdated | unverified | unavailable (outdated is computed)
    "verified_at": "2026-10-01",
    "reverify_due": "2027-04-01",
    "source": { "name": "…", "url": "https://…", "publisher": "…", "source_type": "official_airport", "retrieved_at": "2026-10-01" },
    "notes": null
  }
  ```
- Live and flight responses include `meta` (see the [flight data flow](../architecture/flight-data-flow.md)).
- Errors are FastAPI's `{ "detail": "…" }` (a string, or a list of validation errors for `422`). A database outage is `503`, never an empty list. Live positions never fail on an upstream outage: they return `200` with `meta.mode: "unavailable"` and a `message`.
- Public endpoints are rate-limited per client (in memory, keyed on the address Render's proxy appends to `X-Forwarded-For`): 120 a minute on the REST API, 10 on `/fares/*` (on top of the 120), 60 on `/mcp`. Exceeding the limit returns `429` as `{ "error": "…" }` with `Retry-After`. Health checks aren't counted.
- Request bodies over 16 KB are refused with `413`.
- On the free tier the API may be asleep. The first request after idle can take about 1 minute.

## Endpoints

AI assistants can also use these services through the read-only MCP server at `/mcp` ([MCP guide](./mcp.md)).

### Health
| | |
|---|---|
| `GET /health` | **Implemented.** Always `200` while the process is up. `{ "status": "ok" \| "degraded", "environment", "version", "checks": { "database" \| "postgis" \| "redis": { "status": "ok" \| "error" \| "disabled", "version", "detail" } }, "live": { "source", "fetched_at", "age_s", "aircraft", "last_error", "providers": { name: { "ok", "checked_at", "error", "aircraft", "resting_s" } } } }`. Redis is optional: `disabled` when `REDIS_URL` isn't set. `live` covers this process only |

### Positions
| | |
|---|---|
| `GET /positions?bbox=minLon,minLat,maxLon,maxLat` | **Implemented.** GeoJSON `FeatureCollection` of aircraft + `meta` (`mode`, `source`, `source_url`, `attribution`, `fetched_at`, `generated_at`, `count`, `message`). `source` names what produced the snapshot, for example `adsb.lol + adsb.fi` for the pooled community networks. `message` explains any mode other than `live`, including why the sources failed when `unavailable`. Feature properties: `icao24, callsign, registration, type_code, alt_baro_ft, on_ground, gs_kt, track_deg, vrate_fpm, position_time, is_demo`, plus `origin_iata, destination_iata, flight_number` when a plausible route is known. Positions are as reported; any motion between updates is estimated in the browser |
| `GET /positions/{icao24}` | **Implemented.** Latest state + `reported_route \| null` + `route_note` (why a route is missing or hidden) + `progress` (flown and remaining km, estimated arrival from live position) + `meta`. `404` if not tracked |

### Flights (open data only)
| | |
|---|---|
| `GET /flights/search?q=` | Matches by flight number, callsign or registration across the live snapshot |
| `GET /flights/{flight_number}` | `{ flight, observed_state, live_position \| null, reported_route \| null, estimated_arrival \| null, recent_observed[] , schedule: null, schedule_unavailable_reason, meta }` |

`schedule` is always `null` with open sources. `schedule_unavailable_reason` explains why, so the UI can show "Not available from open data sources".

### Airports
| | |
|---|---|
| `GET /airports?q=&region=&guides_only=&limit=&offset=` | **Implemented.** `{ items, total, limit, offset }` of airport summaries (`limit` default 50, max 200). `q` matches IATA/ICAO exactly and name, city or state partially, typo-tolerant (pg_trgm). Exact codes rank first. `503` (never an empty list) when the database is down |
| `GET /airports/{code}` | **Implemented.** By IATA or ICAO. Location, codes, official website, geodata provenance, terminals with current airline assignments, each with provenance and a computed `outdated` status, and `mapped_terminals` from OpenStreetMap (unverified, shown separately). Always includes `terminal_note`. `404` if unknown |
| `GET /airports/{code}/airlines-seen?days=` | **Implemented.** Airlines whose aircraft were seen on the ground or low near the airport in community ADS-B data, per IST day (`days` 1–30, default 7): `{ iata, days, since, until, days_with_data, airlines: [{ icao, name, aircraft, days_seen, last_seen }], method, source }`. An observation, not a timetable. `404` if unknown |
| `GET /airports/{iata}` (later) | Facilities, transport, outlets and passenger info, each with provenance |
| `GET /airports/{iata}/movements` | Flights observed at the airport yesterday (OpenSky, previous-day batch), with source and date |

### Lounges
| | |
|---|---|
| `GET /lounges?airport=&program=` | **Implemented.** Lounge summaries: airport name and city, terminal, scope, side, `direction` (`departures`, `arrivals` or `transit`) and the programmes accepted today (`{ key, name }`) |
| `GET /lounges/{slug}` | **Implemented.** Full record: hours, amenities as stated, acceptance windows with `in_force` (acceptance only, never card benefits), provenance on each, and `cards`: cards whose benefit in force today names a programme the lounge accepts today (conditions still apply). `404` if unknown |
| `GET /access-programs` | **Implemented.** Lounge programmes: `{ items: [{ key, name, kind, url }] }` |

### Cards
| | |
|---|---|
| `GET /cards?bank=` | **Implemented.** Cards with the domestic and international summaries in force today, plus every issuer (so issuers without cards still show) |
| `GET /cards/{slug}` | **Implemented.** Card, every policy version (newest first, `in_force` flag), rules and provenance, and `programs` per scope with `lounge_list_known`. `404` if unknown |
| `GET /cards/{slug}/lounges` | **Implemented.** `{ card, scopes, lounges }`: departure lounges accepting a programme the card's benefits in force today name. Conditions still apply: use `/eligibility` for an answer. `404` if unknown |
| `GET /cards/compare?slugs=a,b,c` | Side-by-side (P1, later) |

### Search
| | |
|---|---|
| `GET /search?q=&limit=` | **Implemented.** Airports, lounges and cards matching every word of `q` (codes, names, cities, banks), best first: `{ q, items: [{ kind, key, title, subtitle, href }] }` (`limit` default 12, max 30). `href` is the page on the website |

Lounges, cards, policies and acceptances are held in memory for 5 minutes (they change only when the seed runs), so eligibility, search and the two-way lists need no database round trip on a warm cache.

### Fares
Fare search for Indian domestic routes from Ignav, within a request budget ([ADR-0015](../decisions/0015-paid-fare-search-with-a-request-budget.md)). Every endpoint is `Cache-Control: no-store` and limited to 10 requests a minute per client.

| | |
|---|---|
| `POST /fares/search` | **Implemented.** `{ origin, destination, departure_date, return_date?, passengers { adults, children, infants_in_seat, infants_on_lap }, cabin, nearby_airports, max_stops?, airlines?, depart_after_hour?, depart_before_hour?, max_price?, sort }`, where `sort` is best, cheapest or fastest. Returns normalised `offers` (price is the total for all passengers; legs with local times and time zones; `booking { provider, reference }`), `total_offers`, `excluded_abroad`, `airlines`, `providers` (outcome per source), `budget`, `is_demo` and `notice`. Filters and sort apply to cached results (10 minutes). Errors: `422` (validation, or an airport outside India), `429` (budget reached), `502`, `503` (not set up, or the budget can't be checked), `504` |
| `POST /fares/booking-links` | **Implemented.** `{ provider, reference }` from an offer, returning sellers with links, cheapest first. One upstream request the first time per offer, then cached. `404` when the fare expired |
| `GET /fares/budget` | **Implemented.** `{ provider, used, cap, today, daily_cap, near_limit, message }`, or `null` without a paid source |

Airport autocomplete is `GET /airports?q=` (AeroGuide's own data, no upstream cost).

### Eligibility
`POST /eligibility` (**implemented**, [ADR-0009](../decisions/0009-deterministic-eligibility-engine.md)). Unknown fields are rejected, so a card number can't be sent by mistake. Up to 10 cards and 10 guests; `on` defaults to today (IST). `404` for an airport we don't list. The response is `Cache-Control: no-store`, and nothing is stored or logged.

```json
{
  "cards": ["example-bank-voyager"],
  "airport": "DEL",
  "on": "2026-11-20",
  "scope": "domestic",
  "guests": 0,
  "facts": { "example-bank-voyager": { "visits_used": 1, "spend_inr": 60000 } }
}
```

The response (`{ airport, on, scope, lounges_listed, results, unknown_cards, disclaimer }`) has one entry per card, per departure lounge listed at the airport (arrivals and transit lounges are left out): `status` (`yes`, `no` or `depends`), the `checks` behind it (rule, status, message, and `detail` with the bank's quoted wording when there is some), the programmes used, guests covered, how to enter, `notes` (fees, add-on cardholders: informational, never change the answer) and the policy summary, plus a disclaimer.

- A `no` lists only the checks that decided it.
- Missing data is `depends`, never `no`: no recorded benefit for the scope, a programme whose lounge list we don't have, or guests the terms don't mention. A benefit that ended is `no`.
