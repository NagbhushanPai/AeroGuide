# Backend architecture

Last updated: 2026-11-13. Status: proposed.

## Stack

Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x (async, asyncpg), GeoAlchemy2, Alembic, redis-py (asyncio), httpx. Tooling: uv, ruff, mypy, pytest (+ pytest-asyncio, Hypothesis, respx).

## Layout (`apps/api`)

```text
app/
├── main.py                 # app factory: routers, middleware, lifespan (db/redis pools)
├── api/v1/                 # thin routers: parse → call service → map to response schema
│   ├── health.py  airports.py  lounges.py  cards.py  eligibility.py  flights.py  positions.py
├── core/                   # settings, logging, errors, rate limiting, time utils
├── database/               # engine, session dependency, base model, mixins (Provenance, Timestamps)
├── models/                 # SQLAlchemy ORM models per domain
├── schemas/                # Pydantic request/response models per domain (API contract)
├── repositories/           # DB and Redis access only; no business rules
├── services/               # business logic; the "tool-ready" surface (ADR-0008)
│   ├── airports.py  lounges.py  cards.py  flights.py  positions.py
│   └── eligibility/        # engine.py (pure), rules.py (typed rule models), explain.py
├── providers/
│   ├── positions/          # base.py (Protocol), demo.py, adsblol.py, opensky.py
│   ├── flight_info/        # base.py (Protocol), adsbdb.py (routes), opensky.py (airport movements)
│   └── registry.py         # builds providers from settings
├── ingestion/              # on-demand snapshot refresh, single-flight lock, trail ring buffer (ADR-0012)
├── jobs/                   # data_check.py: weekly job run by GitHub Actions (ADR-0013)
└── seed/                   # loader + validation (content lives in /data, see ADR-0007)
migrations/                 # Alembic
tests/
```

## Layer rules

| Layer | May import | May not |
|---|---|---|
| `api` | `services`, `schemas`, `core` | `models`, `repositories`, `providers` directly |
| `services` | `repositories`, `providers`, `schemas`, `core` | FastAPI (`Request` etc.). Services are framework-agnostic |
| `repositories` | `models`, `database` | `services` |
| `providers` | `schemas` (normalised DTOs), `core` | DB |

These rules are enforced with `import-linter` in CI.

Because services are framework-agnostic, take typed Pydantic inputs and return typed Pydantic outputs, they can later be wrapped as AI tools or MCP endpoints without changes.

## Provider interfaces (sketch)

```python
class PositionProvider(Protocol):
    name: str                      # "adsb.lol", "opensky", "demo"
    is_demo: bool
    async def fetch(self, area: BBox) -> PositionBatch: ...   # normalised AircraftState list + fetched_at

class FlightInfoProvider(Protocol):
    name: str
    async def route_for_callsign(self, callsign: str) -> RouteRecord | None: ...
    async def airport_movements(self, icao: str, day: date) -> list[ObservedMovement]: ...
    async def schedule(self, flight_number: str, day: date) -> FlightRecord | None: ...  # None for all open sources
```

Only open, free sources are used ([ADR-0004](../decisions/0004-flight-provider-abstraction.md)). `schedule()` is kept in the interface so a schedule source could be added later without changing services.

`AircraftState` fields: `icao24`, `callsign`, `registration`, `type_code`, `lat`, `lon`, `alt_baro_ft`, `on_ground`, `gs_kt`, `track_deg`, `vrate_fpm`, `squawk`, `position_time`, `source`. **Every field is nullable except `icao24`, `lat`, `lon` and `position_time`.** Nothing is filled in with a guessed default.

## API surface (v1, draft)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health`, `/api/v1/health/data` | Liveness and data freshness |
| GET | `/api/v1/positions?bbox=` | Latest positions as GeoJSON + `meta` |
| GET | `/api/v1/positions/{icao24}` | Single aircraft latest state + reported route (+ 15-min trail, P1) |
| GET | `/api/v1/flights/search?q=` | Search by flight number, callsign or registration |
| GET | `/api/v1/flights/{flight_number}` | Flight page data: live state, reported route, recent observed flights |
| GET | `/api/v1/airports/{iata}/movements` | Flights observed at the airport yesterday (OpenSky) |
| GET | `/api/v1/airports?q=&region=&city=` | Airport search |
| GET | `/api/v1/airports/{iata}` | Airport detail (terminals, airlines, facilities, transport, sources) |
| GET | `/api/v1/airports/{iata}/terminals` | Terminal information |
| GET | `/api/v1/lounges?airport=&terminal=&scope=&amenity=` | Lounge search |
| GET | `/api/v1/lounges/{slug}` | Lounge detail |
| GET | `/api/v1/cards?q=&bank=&network=&benefit=` | Card search |
| GET | `/api/v1/cards/{slug}` | Card detail + current policy + history |
| POST | `/api/v1/eligibility` | Evaluate lounge eligibility (deterministic) |

Full details are in [docs/api/api-overview.md](../api/api-overview.md).

## Errors

Errors use RFC 9457 problem-details JSON (`type`, `title`, `status`, `detail`, `instance`). Upstream source failures map to `503` with `retry_after`. They are never turned into empty "success" responses that look like "no flights".
