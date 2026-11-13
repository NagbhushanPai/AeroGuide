# API overview (v1 draft)

Last updated: 2026-11-13. Status: proposed contract. The generated OpenAPI spec at `/api/v1/openapi.json` becomes the source of truth once implemented.

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
- Public endpoints are rate-limited per IP (in memory). Exceeding the limit returns `429`.
- On the free tier the API may be asleep. The first request after idle can take about 1 minute.

## Endpoints

### Health
| | |
|---|---|
| `GET /health` | `{ "status": "ok", "db": "ok", "postgis": "3.x", "redis": "ok" }` |
| `GET /health/data` | Snapshot age, active provider, last error |

### Positions
| | |
|---|---|
| `GET /positions?bbox=minLon,minLat,maxLon,maxLat` | GeoJSON `FeatureCollection` of aircraft + `meta`. Feature properties: `icao24, callsign, registration, type_code, alt_baro_ft, on_ground, gs_kt, track_deg, vrate_fpm, position_time, is_demo` |
| `GET /positions/{icao24}` | Latest state + `reported_route \| null` + `meta` (+ `trail` in P1) |

### Flights (open data only)
| | |
|---|---|
| `GET /flights/search?q=` | Matches by flight number, callsign or registration across the live snapshot |
| `GET /flights/{flight_number}` | `{ flight, observed_state, live_position \| null, reported_route \| null, estimated_arrival \| null, recent_observed[] , schedule: null, schedule_unavailable_reason, meta }` |

`schedule` is always `null` with open sources. `schedule_unavailable_reason` explains why, so the UI can show "Not available from open data sources".

### Airports
| | |
|---|---|
| `GET /airports?q=&city=&region=` | Airport summaries |
| `GET /airports/{iata}` | Overview, location, terminals (with airlines), facilities, transport, outlets and passenger info, each with provenance |
| `GET /airports/{iata}/terminals` | Terminals and airline assignments |
| `GET /airports/{iata}/movements` | Flights observed at the airport yesterday (OpenSky, previous-day batch), with source and date |

### Lounges
| | |
|---|---|
| `GET /lounges?airport=&terminal=&scope=&amenity=` | Lounge summaries |
| `GET /lounges/{slug}` | Full lounge record, access methods (acceptance only), provenance |

### Cards
| | |
|---|---|
| `GET /cards?q=&bank=&network=&benefit=domestic\|international` | Card summaries with current policy headline |
| `GET /cards/{slug}` | Card, variants, current policies, rules, **policy history**, provenance |
| `GET /cards/compare?slugs=a,b,c` | Side-by-side (P1) |

### Eligibility
`POST /eligibility`

Request (no sensitive card data accepted. Unknown fields are rejected):
```json
{
  "card_variant_id": "uuid",
  "lounge_slug": "…",                    // or "airport_iata"
  "travel_date": "2026-12-01",
  "journey": "domestic",                 // domestic | international
  "spend_last_period_inr": 60000,        // optional, self-reported
  "visits_used_this_period": 1           // optional, self-reported
}
```

Response:
```json
{
  "status": "conditional",               // eligible | conditional | not_eligible | unknown
  "reasons": [{ "code": "SPEND_GATE_UNCONFIRMED", "message": "…" }],
  "requirements": [{ "type": "spend_gate", "text": "…" }],
  "program": { "code": "…", "name": "…" },
  "policy_version_id": "uuid",
  "policy_valid_from": "2026-10-01",
  "sources": [{ "name": "…", "url": "…", "retrieved_at": "…" }],
  "evaluated_at": "2026-11-13T10:00:00Z",
  "disclaimer": "Final access is decided by the lounge and your card issuer."
}
```
