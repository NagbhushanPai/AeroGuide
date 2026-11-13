# Flight data flow

Last updated: 2026-11-13. Status: proposed.

## Live positions

```mermaid
sequenceDiagram
  autonumber
  participant P as Position provider
  participant K as Worker
  participant R as Redis
  participant DB as Postgres
  participant A as API
  participant B as Browser

  loop every ~10 s
    K->>P: fetch(India bbox)
    P-->>K: raw states
    K->>K: normalise → AircraftState[] (drop invalid, tag source)
    K->>R: SET positions:snapshot (compressed JSON + meta, TTL 5 min)
    K->>R: GEOADD positions:geo · HSET positions:ac:{icao24}
    K->>DB: every 60 s per aircraft → INSERT flight_positions (sampled)
  end
  B->>A: GET /api/v1/positions?bbox=…
  A->>R: read snapshot (filter by bbox via GEO)
  A-->>B: GeoJSON + meta {mode, source, fetched_at, generated_at}
```

### Response `meta`

```json
{
  "mode": "live",               // "live" | "demo" | "degraded" | "unavailable"
  "source": "adsb.lol",
  "source_url": "https://adsb.lol",
  "attribution": "Data © adsb.lol contributors, ODbL",
  "fetched_at": "2026-11-13T13:10:03Z",
  "generated_at": "2026-11-13T13:10:05Z",
  "count": 612
}
```

### Freshness rules

| Age of a position (`now − position_time`) | Behaviour |
|---|---|
| < 60 s | Normal |
| 60 s – 5 min | Shown faded with "last seen X ago". No ETA |
| > 5 min | Removed from the map. Searchable as "last seen" for 30 min |

| Age of the whole snapshot | `meta.mode` |
|---|---|
| < 60 s | `live` (or `demo` if the demo provider is configured) |
| 60 s – 5 min | `degraded`, with a banner: "Live data delayed" |
| none or > 5 min | `unavailable`. The map shows basemap and airports with an explanation |

### Provider failover

The configured order is, for example, `POSITION_PROVIDERS=adsblol,opensky`. If the first provider fails, the worker tries the next. `meta.source` always names the provider that actually produced the data. **The demo provider is never in the automatic failover chain** ([ADR-0011](../decisions/0011-demo-mode-is-explicit.md)).

## Flight details (on demand)

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant R as Redis
  participant O as Operational provider
  participant DB as Postgres
  B->>A: GET /api/v1/flights/AI101?date=2026-11-13
  A->>R: cache lookup flight:AI101:2026-11-13
  alt cache miss
    A->>O: flight("AI101", date)
    O-->>A: FlightRecord | none
    A->>DB: upsert flights (with source + fetched_at)
    A->>R: cache (TTL 2 min if active, 1 h if landed or scheduled far ahead)
  end
  A->>R: join live position by callsign/icao24 (if airborne)
  A-->>B: flight + position + meta
```

With `OPERATIONAL_PROVIDER=none`, the endpoint returns only what the position data supports, with `schedule: null` and a reason the UI shows as "Schedule data not available".

## Identifier mapping

- Flight number (IATA, `AI101`) ↔ callsign (ICAO, `AIC101`): mapped by the airline's IATA/ICAO prefix pair from the `airlines` table. Numeric suffixes don't always match (callsigns can have letter suffixes), so the mapping is a **search hint**, confirmed only by the operational provider.
- Route from a community callsign lookup: shown only as **"reported route"** with its source. Hidden when the aircraft's track clearly contradicts it.

## Retention

- Redis: only the latest state (5 min TTL).
- `flight_positions`: sampled once a minute per aircraft, partitioned by day, kept **7 days** (configurable). This covers trails and debugging without bulk-redistributing provider data. Storage terms must be checked against each provider's licence ([provider research](../research/aviation-data-providers.md)).
