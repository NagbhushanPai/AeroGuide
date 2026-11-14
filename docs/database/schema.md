# Schema documentation

Last updated: 2026-11-13. This document is updated whenever a migration changes it.

**Implemented (migration 0002):** `sources`, `record_sources`, `source_checks`, `airports`, `terminals`, `airlines`, `terminal_airlines`.

**Implemented (migration 0004):** `amenities`, `access_programs`, `lounges`, `lounge_amenities`, `lounge_access_methods`, `banks`, `card_networks`, `credit_cards`, `lounge_policies` and `policy_rules`. There's no `card_variants` table: a variant with different benefits is its own card. Exclusion constraints (`ex_lounge_access_methods_no_overlap`, `ex_lounge_policies_no_overlap`) use `btree_gist` over `daterange(valid_from, valid_to)`. Versions are linked by date, not by `superseded_by_id`.

**Implemented (migration 0003):** `osm_terminals` (provenance mixin; unique `osm_ref`) and `airport_sightings` (`bigint` identity; unique (`airport_id`, `airline_icao`, `icao24`, `service_date`); index (`airport_id`, `service_date`); rows older than 45 days are deleted by the live service). Both are deliberately separate from `terminals` and `terminal_airlines`, so mapped or observed data can't be mistaken for a verified assignment. Everything else is still proposed (Stages 4 and 5).

Differences from the first proposal, decided while implementing:

| Table | Change | Why |
|---|---|---|
| `sources` | Added `key` (unique text). `retrieved_at` is a `date` | Seed files refer to sources by a stable handle. Retrieval is recorded per day |
| `airports` | Added `elevation_ft`, `size` (`large`/`medium`/`small`), `has_guide`, `official_source_id`. `icao` is nullable | Directory ordering, guide listing and the "official website" link. A few airports have no ICAO code |
| `airports.region` | Text with a check constraint (six values) | Follows the Zonal Councils; see the data dictionary |
| `terminal_airlines` | `valid_from` is required | It's part of the unique key |
| `source_checks` | Added `error` | Network failures have no HTTP status |

## Conventions

- Primary keys are `uuid` (generated with `gen_random_uuid()`), except for natural-key reference tables (`aircraft_types.icao_code`, `amenities.code`, `card_networks.code`, `aircraft.icao24`) and `flight_positions.id` (`bigint` identity, for insert speed).
- Every table has `created_at` and `updated_at` (`timestamptz`, default `now()`).
- Enums are Postgres enums managed in migrations.
- Codes are stored uppercase (IATA, ICAO), with check constraints such as `iata ~ '^[A-Z]{3}$'`.
- All timestamps are UTC (`timestamptz`). `service_date` is the local (IST) operating date.

## Provenance mixin (P)

| Column | Type | Constraint |
|---|---|---|
| `verification_status` | enum `verification_status` (`verified`, `unverified`, `unavailable`) | not null, default `unverified` |
| `verified_at` | date | required when `verified` |
| `verified_by` | text | required when `verified` |
| `reverify_after_days` | int | default per table (airports 365, terminal airlines 90, lounges 60, card policies 60) |
| `primary_source_id` | uuid → `sources.id` | required when `verified` |
| `notes` | text | |

Check constraint: `verification_status <> 'verified' OR (verified_at IS NOT NULL AND primary_source_id IS NOT NULL AND verified_by IS NOT NULL)`. The source-type rule (a `verified` record needs an official or licensed source) is checked in the seed validator, because it spans tables.

## Key constraints and indexes

| Table | Constraint or index |
|---|---|
| `airports` | unique `iata`, unique `icao`; GiST on `location`; trigram GIN on `name` and `city` |
| `terminals` | unique (`airport_id`, `code`) |
| `terminal_airlines` | unique (`terminal_id`, `airline_id`, `operation`, `valid_from`) |
| `airlines` | unique `icao`; index `iata` (IATA codes aren't globally unique over time) |
| `flights` | unique (`flight_number`, `service_date`, `origin_airport_id`); index `callsign`; index `aircraft_icao24` |
| `flight_positions` | partitioned by range on `position_time` (daily); index (`icao24`, `position_time desc`); GiST on `position` |
| `lounges` | unique `slug`; index `airport_id`, `terminal_id`; GiST on `location` |
| `lounge_access_methods` | exclusion: no overlapping `daterange(valid_from, valid_to)` per (`lounge_id`, `access_program_id`) |
| `credit_cards` | unique `slug`; index `bank_id`, `network_code` (nullable since migration 0005: not every bank states the network) |
| `lounge_policies` | exclusion: no overlapping `daterange(valid_from, valid_to)` per (`card_variant_id`, `scope`) |
| `policy_rules` | check: `rule_type` in the known set; `rule` is validated by Pydantic before insert |
| `record_sources` | PK (`source_id`, `record_table`, `record_id`) |
| `source_checks` | index (`source_id`, `checked_at desc`). Written only by the weekly job's dedicated role |

## Required extensions

`postgis`, `pg_trgm`, `btree_gist`.

## Redis keys (not in Postgres, listed for completeness)

The free tier allows 500K commands a month, so Redis is used sparingly. The live snapshot, bbox filtering and rate limits are handled in API memory ([ADR-0012](../decisions/0012-zero-budget-hosting.md)).

| Key | Type | TTL | Written |
|---|---|---|---|
| `positions:snapshot` | string (compressed JSON) | 5 min | At most once every 60 s, for warm starts |
| `route:{callsign}` | string (JSON) | 6 h | On cache miss when a user selects a flight |
| `movements:{icao}:{date}` | string (JSON) | 24 h | First request of the day per airport |
