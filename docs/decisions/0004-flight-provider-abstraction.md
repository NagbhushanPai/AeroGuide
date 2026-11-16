# ADR-0004: Flight provider abstraction and data classes

- Status: Accepted
- Date: 2026-11-13

## Context
AeroGuide is non-commercial with a zero budget, so it may use **open data sources only** (see the [provider research](../research/aviation-data-providers.md)). Open sources give good live positions but no airline schedules or operational status. Business logic must not be tied to one source, so a better source can be added later.

## Decision
1. Split providers into two interfaces:
   - `PositionProvider`: bulk ADS-B-style positions for an area. Fetched on demand by the API ([ADR-0012](./0012-zero-budget-hosting.md)).
   - `FlightInfoProvider`: callsign → reported route, and airport → observed departures and arrivals. Called on demand and cached. A schedule or status capability is part of the interface but returns `None` for every open source.
2. Normalise into internal DTOs (`AircraftState`, `FlightRecord`, `RouteRecord`) where every non-identifying field is nullable. Adapters must not invent values.
3. Every DTO carries `source` (provider name) and `fetched_at`. These flow into API `meta` and the UI.
4. Providers are selected by config (`POSITION_PROVIDERS=adsblol,opensky`, `FLIGHT_INFO_PROVIDERS=adsbdb,opensky`) in `providers/registry.py`.
5. Adapters: `demo`, `adsblol`, `opensky` (positions); `adsbdb` (reported routes); `opensky` (observed airport movements). Only open, free sources.

## Implementation note (2026-11-16)

What was built differs in the details (`apps/api/app/providers/`, `app/core/config.py`):

- **Positions:** `PositionProvider` adapters `adsblol`, `adsbfi`, `opensky` and `demo`, selected by `POSITION_PROVIDERS` (default `adsblol,adsbfi,opensky`). adsb.lol and adsb.fi share one format and run as a `ReadsbPool` with point-by-point failover ([ADR-0012](./0012-zero-budget-hosting.md)).
- **No `FlightInfoProvider` interface and no `FLIGHT_INFO_PROVIDERS`.** The only flight-info source is `AdsbdbRoutes` (callsign → reported route), switched by `ROUTE_LOOKUPS_ENABLED`. The OpenSky airport-movements adapter was not built: "airlines seen at an airport" comes instead from the live snapshot itself, recorded in `airport_sightings` (`SIGHTINGS_ENABLED`).
- **DTOs:** `AircraftState` and `ReportedRoute` (`app/schemas/positions.py`), with nullable non-identifying fields and a `source` on each. There is no `FlightRecord`. `fetched_at` is carried once per response in `meta`, not on every DTO.

## Consequences
- Swapping or adding a source is a config and adapter change only.
- Flight pages show observed data only: no scheduled times, gates, delays or cancellations. They say so explicitly.
- Each adapter needs recorded-fixture tests, and normalisation rules are documented per adapter.
