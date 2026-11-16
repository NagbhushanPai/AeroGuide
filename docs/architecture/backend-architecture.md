# Backend architecture

Last updated: 2026-11-16. Status: implemented.

## Stack

Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x (async, asyncpg), GeoAlchemy2, Alembic, redis-py (asyncio), httpx, the `mcp` SDK. Tooling: uv, ruff, mypy (strict), pytest (+ pytest-asyncio, Hypothesis).

## Layout (`apps/api`)

```text
app/
├── main.py                 # app factory: routers, CORS, body and rate limits, lifespan (engine, Redis, live service, fare service), /mcp mount
├── api/
│   ├── deps.py             # AppResources (settings, engine, redis, live, fares) created once in the lifespan
│   └── v1/                 # thin routers: parse → call service → map to response schema
│       ├── health.py  positions.py  airports.py  fares.py
│       └── lounges.py      # lounges, cards, access programmes, site search, eligibility
├── core/                   # config.py (settings), logging.py (JSON logs), geo.py (great circle), india.py (regions, IST)
├── database/               # engine/session, base model, Redis client
├── models/                 # SQLAlchemy ORM models: sources, airports, observations, lounges (incl. cards), usage; mixins.py (Provenance, Timestamps, UuidPk)
├── schemas/                # Pydantic request/response models per domain (API contract)
├── services/               # business logic; the "tool-ready" surface (ADR-0008)
│   └── airports.py  lounges.py  positions.py  fares.py  health.py
├── eligibility/            # engine.py (pure, deterministic) and rules.py (typed rule models), ADR-0009
├── fares/                  # budget.py (Postgres request ledger + caps), cache.py, ranking.py, cities.py (ADR-0015)
├── mcp_server/             # server.py (12 read-only tools), fares.py (search_flights), ratelimit.py (per-client limit, body limit), ADR-0014
├── providers/
│   ├── positions/          # base.py (Protocol), demo.py, adsblol.py (adsb.lol, adsb.fi and the ReadsbPool), opensky.py
│   ├── flight_info/        # adsbdb.py (reported routes)
│   ├── fares/              # base.py (Protocol), ignav.py, mock.py
│   └── registry.py         # builds providers from settings; pools adsb.lol + adsb.fi when both are configured
├── ingestion/              # live.py: on-demand snapshot refresh with a single-flight lock (ADR-0012); sightings.py: airline sightings per airport
├── jobs/                   # data_check.py: weekly job (ADR-0013); ping_db.py: database keep-alive
└── seed/                   # loader + validation (content lives in /data, see ADR-0007); `python -m app.seed [--check]`
migrations/                 # Alembic (0001-0007)
scripts/                    # check_ignav_coverage.py
tests/
```

## Layer rules

| Layer | May import | May not |
|---|---|---|
| `api` | `services`, `schemas`, `core` | `models`, `providers` directly |
| `services` | `models`, `database`, `providers`, `schemas`, `core` | FastAPI (`Request` etc.). Services are framework-agnostic |
| `providers` | `schemas` (normalised DTOs), `core` | DB |

There is no separate repository layer: services query the database directly. The rules are a convention, reviewed in PRs; they are not enforced by a tool.

Because services are framework-agnostic, take typed Pydantic inputs and return typed Pydantic outputs, the MCP server (`mcp_server/`) wraps them as tools without changes.

## Provider interfaces

```python
class PositionProvider(Protocol):                 # providers/positions/base.py
    name: str                                     # "adsb.lol", "adsb.fi", "adsb.lol + adsb.fi", "opensky", "demo"
    url: str
    attribution: str
    is_demo: bool
    async def fetch(self) -> list[AircraftState]: ...   # India coverage area; raises on failure, never an empty list

class RouteLookup(Protocol):                      # ingestion/live.py; implemented by providers/flight_info/adsbdb.py
    async def route_for_callsign(self, callsign: str) -> ReportedRoute | None: ...

class FlightProvider(Protocol):                   # providers/fares/base.py (ADR-0015)
    name: str
    is_demo: bool
    async def search(self, query: FareQuery) -> list[Offer]: ...
    async def booking_links(self, reference: str) -> list[BookingLink]: ...
```

Live positions and routes come only from open, free sources ([ADR-0004](../decisions/0004-flight-provider-abstraction.md)). Fare search is the one paid source, Ignav, kept inside a hard request budget ([ADR-0015](../decisions/0015-paid-fare-search-with-a-request-budget.md)). There is no schedule source: open data has none, and the API doesn't pretend otherwise.

`AircraftState` fields: `icao24`, `lat`, `lon`, `position_time`, `callsign`, `registration`, `type_code`, `alt_baro_ft`, `on_ground`, `gs_kt`, `track_deg`, `vrate_fpm`, `squawk`, `source`, `is_demo`. **Every optional field is `None` when the source didn't report it**; only `icao24`, `lat`, `lon`, `position_time` and `source` are required (`on_ground` and `is_demo` default to `false`). Nothing is filled in with a guessed default.

## API surface (v1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Liveness, database/PostGIS/Redis checks and the live pipeline's state (snapshot age, source, last error, per-provider rest) |
| GET | `/api/v1/positions?bbox=` | Latest positions as GeoJSON + `meta` |
| GET | `/api/v1/positions/{icao24}` | Single aircraft latest state + reported route + progress |
| GET | `/api/v1/airports?q=&region=&guides_only=` | Airport search |
| GET | `/api/v1/airports/{code}` | Airport detail (terminals, airline assignments, mapped terminals, sources) |
| GET | `/api/v1/airports/{code}/airlines-seen` | Airlines seen at the airport in the live snapshot (ADS-B sightings) |
| GET | `/api/v1/lounges?airport=&program=` | Lounge list |
| GET | `/api/v1/lounges/{slug}` | Lounge detail |
| GET | `/api/v1/access-programs` | Lounge programmes |
| GET | `/api/v1/cards?bank=` | Card list |
| GET | `/api/v1/cards/{slug}` | Card detail + every policy version |
| GET | `/api/v1/cards/{slug}/lounges` | Lounges accepting a programme the card names |
| GET | `/api/v1/search?q=` | Site search across airports, lounges and cards |
| POST | `/api/v1/eligibility` | Evaluate lounge eligibility (deterministic) |
| POST | `/api/v1/fares/search` | Fare search (Ignav, budgeted) |
| POST | `/api/v1/fares/booking-links` | Sellers for one offer |
| GET | `/api/v1/fares/budget` | Request budget used so far |
| — | `/mcp` | MCP server for AI assistants (Streamable HTTP), 12 read-only tools |

OpenAPI is served at `/api/v1/openapi.json` (Swagger UI at `/api/v1/docs`). Full details are in [docs/api/api-overview.md](../api/api-overview.md) and [docs/api/mcp.md](../api/mcp.md).

## Limits

All in process memory, per client address (the last `X-Forwarded-For` entry behind Render's proxy): 120 requests a minute on the REST API, 10 a minute on `/api/v1/fares/*`, 60 a minute on `/mcp`; health checks aren't counted. Request bodies over 16 KB are refused (`413`).

## Errors

Errors are FastAPI's JSON `{ "detail": ... }` with the right status: `404` when a record or aircraft isn't known, `422` for bad input, `503` when the database or a fare source is unavailable. The rate-limit middleware answers before FastAPI, so a `429` is `{ "error": "…" }` with `Retry-After`. Upstream source failures are never turned into empty "success" responses that look like "no flights": the positions response says `unavailable` and why in `meta`.
