# API overview (v1 draft)

Last updated: 2026-11-14. Status: proposed contract. The generated OpenAPI spec at `/api/v1/openapi.json` becomes the source of truth once implemented.

## Conventions

- Base path `/api/v1`. JSON only. `snake_case` fields.
- List endpoints: `?limit=` (default 20, max 100) and `?cursor=`. Responses are `{ "items": [...], "next_cursor": "..." | null }`.
- Any response containing changeable facts includes provenance per record:
  ```json
  "provenance": {
    "status": "verified",            // verified | unverified | outdated | unavailable
    "verified_at": "2026-10-01",
    "sources": [{ "name": "…", "url": "https://…", "retrieved_at": "2026-10-01" }]
  }
  ```
- Live and flight responses include `meta` (see the [flight data flow](../architecture/flight-data-flow.md)).
- Errors use RFC 9457 problem details. Upstream failures return `503` with a `Retry-After` header.
- Public endpoints are rate-limited per client (in memory, keyed on the address Render's proxy appends to `X-Forwarded-For`): 120 a minute on the REST API, 60 on `/mcp`. Exceeding the limit returns `429` with `Retry-After`. Health checks aren't counted.
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
| `GET /positions?bbox=minLon,minLat,maxLon,maxLat` | **Implemented.** GeoJSON `FeatureCollection` of aircraft + `meta`. Feature properties: `icao24, callsign, registration, type_code, alt_baro_ft, on_ground, gs_kt, track_deg, vrate_fpm, position_time, is_demo` |
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
| `GET /airports?q=&region=&guides_only=&limit=&offset=` | **Implemented.** Airport summaries. `q` matches IATA/ICAO exactly and name, city or state partially, typo-tolerant (pg_trgm). Exact codes rank first. `503` (never an empty list) when the database is down |
| `GET /airports/{code}` | **Implemented.** By IATA or ICAO. Location, codes, official website, geodata provenance, terminals with current airline assignments, each with provenance and a computed `outdated` status. Always includes `terminal_note` |
| `GET /airports/{iata}` (later) | Facilities, transport, outlets and passenger info, each with provenance |
| `GET /airports/{iata}/movements` | Flights observed at the airport yesterday (OpenSky, previous-day batch), with source and date |

### Lounges
| | |
|---|---|
| `GET /lounges?airport=&program=` | **Implemented.** Lounge summaries: airport name and city, terminal, scope, side, `direction` (`departures`, `arrivals` or `transit`) and the programmes accepted today (`{ key, name }`) |
| `GET /lounges/{slug}` | **Implemented.** Full record: hours, amenities as stated, acceptance windows with `in_force` (acceptance only, never card benefits), provenance on each, and `cards`: cards whose benefit in force today names a programme the lounge accepts today (conditions still apply) |
| `GET /access-programs` | **Implemented.** Lounge programmes |

### Cards
| | |
|---|---|
| `GET /cards?bank=` | **Implemented.** Cards with the domestic and international summaries in force today, plus every issuer (so issuers without cards still show) |
| `GET /cards/{slug}` | **Implemented.** Card, every policy version (newest first, `in_force` flag), rules and provenance, and `programs` per scope with `lounge_list_known` |
| `GET /cards/{slug}/lounges` | **Implemented.** Departure lounges accepting a programme the card's benefits in force today name. Conditions still apply: use `/eligibility` for an answer |
| `GET /cards/compare?slugs=a,b,c` | Side-by-side (P1, later) |

### Search
| | |
|---|---|
| `GET /search?q=&limit=` | **Implemented.** Airports, lounges and cards matching every word of `q` (codes, names, cities, banks), best first: `{ q, items: [{ kind, key, title, subtitle, href }] }`. `href` is the page on the website |

Lounges, cards, policies and acceptances are held in memory for 5 minutes (they change only when the seed runs), so eligibility, search and the two-way lists need no database round trip on a warm cache.

### Eligibility
`POST /eligibility` (**implemented**, [ADR-0009](../decisions/0009-deterministic-eligibility-engine.md)). Unknown fields are rejected, so a card number can't be sent by mistake. The response is `Cache-Control: no-store`, and nothing is stored or logged.

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

The response has one entry per card, per departure lounge listed at the airport (arrivals and transit lounges are left out): `status` (`yes`, `no` or `depends`), the `checks` behind it (rule, status, message, and `detail` with the bank's quoted wording when there is some), the programmes used, guests covered, how to enter, `notes` (fees, add-on cardholders: informational, never change the answer) and the policy summary, plus a disclaimer.

- A `no` lists only the checks that decided it.
- Missing data is `depends`, never `no`: no recorded benefit for the scope, a programme whose lounge list we don't have, or guests the terms don't mention. A benefit that ended is `no`.
