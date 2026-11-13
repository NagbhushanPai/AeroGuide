# Database architecture

Last updated: 2026-11-13. Status: proposed. The entity details are in [docs/database/](../database/).

## Principles

1. **Postgres is the source of truth for content and policy.** Redis holds only derived or ephemeral state.
2. **Provenance is part of the schema, not an afterthought.** Every mutable fact-bearing table uses the `Provenance` mixin ([ADR-0006](../decisions/0006-content-provenance-and-verification.md)).
3. **History is append-only where rules change.** Card lounge policies and lounge programme acceptance are versioned with `valid_from` and `valid_to`, never updated in place.
4. **Geography uses PostGIS.** Airports, terminals and lounges store `geography(Point, 4326)`. Flight positions store `geography(Point, 4326)` with a GiST index.
5. **Unknown is not false.** Boolean facts that may be unverified (for example `has_showers`) are modelled as tags that are present only when sourced, or as nullable booleans. Never `default false`.

## Domains

| Domain | Tables |
|---|---|
| Provenance | `sources`, `record_sources` |
| Airports | `airports`, `terminals`, `terminal_airlines`, `airport_facilities`, `airport_transport`, `airport_outlets` |
| Aviation reference | `airlines`, `aircraft_types`, `aircraft` |
| Flights | `flights`, `flight_positions` (partitioned) |
| Lounges | `lounges`, `amenities`, `lounge_amenities`, `access_programs`, `lounge_access_methods` (versioned) |
| Cards | `banks`, `card_networks`, `credit_cards`, `card_variants`, `lounge_policies` (versioned), `policy_rules` |

The policy-history requirement is met by the version rows themselves: `lounge_policies` keeps every version, and `superseded_by_id` links them in a chain. A separate history table would only duplicate that.

## Indexing highlights

- `airports(iata)` unique, `airports(icao)` unique, trigram index (`pg_trgm`) on name and city for search.
- GiST on every `geography` column.
- `flight_positions(icao24, position_time desc)`, partitioned by `position_time` (daily).
- `lounge_policies(card_variant_id, valid_from desc)` with an exclusion constraint preventing overlapping validity ranges per variant and scope (`btree_gist` + `daterange`).
- `credit_cards(slug)` and `lounges(slug)` unique.

## Migrations

- Alembic with autogenerate, **always reviewed by hand** (PostGIS types, partitions and exclusion constraints need manual DDL).
- Extensions enabled in the first migration: `postgis`, `pg_trgm`, `btree_gist`.
- Every migration must support downgrade (tested in CI).

## Hosting

Supabase (managed Postgres with PostGIS available) is the default target. Any managed Postgres ≥ 15 with PostGIS works. Connection pooling goes through the provider's pooler. Use session mode for Alembic and transaction mode for the API.
