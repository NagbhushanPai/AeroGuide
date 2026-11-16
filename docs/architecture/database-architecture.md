# Database architecture

Last updated: 2026-11-16. Status: implemented (migrations 0001-0007). The entity details are in [docs/database/](../database/).

## Principles

1. **Postgres is the source of truth for content and policy.** Redis holds only derived or ephemeral state.
2. **Provenance is part of the schema, not an afterthought.** Every mutable fact-bearing table uses the `Provenance` mixin ([ADR-0006](../decisions/0006-content-provenance-and-verification.md)).
3. **History is append-only where rules change.** Card lounge policies and lounge programme acceptance are versioned with `valid_from` and `valid_to`, never updated in place.
4. **Geography uses PostGIS.** Airports, terminals and lounges store `geography(Point, 4326)`. Flight positions store `geography(Point, 4326)` with a GiST index.
5. **Unknown is not false.** Boolean facts that may be unverified (for example `has_showers`) are modelled as tags that are present only when sourced, or as nullable booleans. Never `default false`.

## Domains

| Domain | Tables |
|---|---|
| Provenance | `sources`, `record_sources`, `source_checks` (weekly job results, [ADR-0013](../decisions/0013-weekly-data-check.md)) |
| Airports | `airports`, `terminals`, `terminal_airlines` (versioned) |
| Open data about airports | `osm_terminals` (OpenStreetMap, unverified), `airport_sightings` (ADS-B observations, written by the live service, 45-day retention) |
| Aviation reference | `airlines` |
| Lounges | `lounges`, `amenities`, `lounge_amenities`, `access_programs`, `lounge_access_methods` (versioned) |
| Cards | `banks`, `card_networks`, `credit_cards`, `lounge_policies` (versioned), `policy_rules` |
| Usage | `provider_usage` (upstream requests per paid provider per IST day, the fare search budget, [ADR-0015](../decisions/0015-paid-fare-search-with-a-request-budget.md)) |

Not built: airport facilities, transport and outlets, aircraft reference, and the `flights` / `flight_positions` tables from the first proposal. Live positions stay in memory ([ADR-0012](../decisions/0012-zero-budget-hosting.md)). A card variant with different benefits is its own card, so there is no `card_variants` table.

The policy-history requirement is met by the version rows themselves: `lounge_policies` keeps every version of a card's benefit per scope, linked by their `valid_from` / `valid_to` dates. A separate history table would only duplicate that.

## Indexing highlights

- `airports(iata)` unique, `airports(icao)` unique, trigram index (`pg_trgm`) on name and city for search.
- GiST on `airports.location`; `lounges.location` and `osm_terminals.location` are `geography` too (no spatial index yet: a few dozen rows).
- `lounge_policies` unique (`card_id`, `scope`, `valid_from`) with an exclusion constraint preventing overlapping validity ranges per card and scope (`btree_gist` + `daterange`). The same pattern on `lounge_access_methods` per lounge and programme. Both are `DEFERRABLE INITIALLY DEFERRED` since migration 0006, so the seed can replace a version inside one transaction.
- `credit_cards(slug)` and `lounges(slug)` unique.
- `airport_sightings` unique (`airport_id`, `airline_icao`, `icao24`, `service_date`) and index (`airport_id`, `service_date`).

## Migrations

- Alembic with autogenerate, **always reviewed by hand** (PostGIS types and exclusion constraints need manual DDL).
- Extensions enabled in the first migration: `postgis`, `pg_trgm`, `btree_gist`.
- Every migration must support downgrade (`tests/test_migrations.py`, run in CI against Postgres+PostGIS).
- Production migrations and the seed run from the `deploy-data.yml` workflow, not from the API container.

## Hosting

Supabase **free tier** (500 MB, PostGIS available), region Mumbai. Content data is a few MB, so it fits easily. Position history is the only thing that wouldn't fit, and it isn't stored. Any managed Postgres ≥ 15 with PostGIS works. Connections go through Supabase's **session pooler** (port 5432) for both Alembic and the API: the transaction pooler breaks asyncpg's prepared statements. The database is kept awake by the twice-weekly `keep-alive.yml` workflow.
