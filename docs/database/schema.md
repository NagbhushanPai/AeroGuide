# Schema documentation

Last updated: 2026-11-16. This document is updated whenever a migration changes it. Migrations live in `apps/api/migrations/versions/` (0001-0007); the ORM models in `apps/api/app/models/`.

**Implemented (migration 0002):** `sources`, `record_sources`, `source_checks`, `airports`, `terminals`, `airlines`, `terminal_airlines`.

**Implemented (migration 0003):** `osm_terminals` (provenance mixin; unique `osm_ref`) and `airport_sightings` (`bigint` identity; unique (`airport_id`, `airline_icao`, `icao24`, `service_date`); index (`airport_id`, `service_date`); rows older than 45 days are deleted by the live service). Both are deliberately separate from `terminals` and `terminal_airlines`, so mapped or observed data can't be mistaken for a verified assignment.

**Implemented (migration 0004):** `amenities`, `access_programs`, `lounges`, `lounge_amenities`, `lounge_access_methods`, `banks`, `card_networks`, `credit_cards`, `lounge_policies` and `policy_rules`. There's no `card_variants` table: a variant with different benefits is its own card, so `lounge_policies.card_id` points at `credit_cards`. Exclusion constraints (`ex_lounge_access_methods_no_overlap`, `ex_lounge_policies_no_overlap`) use `btree_gist` over `daterange(valid_from, valid_to)`. Versions are linked by date, not by `superseded_by_id`.

**Implemented (migration 0005):** `credit_cards.network_code` is nullable (a bank that doesn't state the network is recorded as "not stated").

**Implemented (migration 0006):** `lounges.direction` (enum `lounge_direction`: `departures`, `arrivals`, `transit`; default `departures`). `policy_rules.rule_type` also allows the informational `fee` and `add_on_cardholders`. Both exclusion constraints become `DEFERRABLE INITIALLY DEFERRED`, so the seed can replace a version whose `valid_from` changed inside one transaction.

**Implemented (migration 0007):** `provider_usage` (`provider` text, `day` date, `requests` int ≥ 0, `updated_at`; PK (`provider`, `day`)): upstream requests per paid provider per IST day, read and incremented in one locked transaction by the fare search budget guard ([ADR-0015](../decisions/0015-paid-fare-search-with-a-request-budget.md)).

**Not built** (from the first proposal): `airport_facilities`, `airport_transport`, `airport_outlets`, `aircraft_types`, `aircraft`, `flights`, `flight_positions`. Live positions stay in memory ([ADR-0012](../decisions/0012-zero-budget-hosting.md)). `source_checks` exists but nothing writes it yet: the weekly job keeps last week's hashes in the GitHub issue it maintains.

Differences from the first proposal, decided while implementing:

| Table | Change | Why |
|---|---|---|
| `sources` | Added `key` (unique text) and `publisher`. `retrieved_at` is a `date` | Seed files refer to sources by a stable handle. Retrieval is recorded per day |
| `airports` | Added `elevation_ft`, `size` (`large`/`medium`/`small`), `has_guide`, `official_source_id`. `icao` is nullable | Directory ordering, guide listing and the "official website" link. A few airports have no ICAO code |
| `airports.region` | Text with a check constraint (six values) | Follows the Zonal Councils; see the data dictionary |
| `terminal_airlines` | `valid_from` is required | It's part of the unique key |
| `source_checks` | Added `error` | Network failures have no HTTP status |
| `lounges` | `terminal` is free text, not a FK to `terminals` | The source names the terminal; a curated terminal row may not exist yet |
| `access_programs` | `key` (unique) and `url` instead of `code` | Same stable-handle convention as `sources` |
| `banks` | Added `url` | Link to the issuer |

## Conventions

- Primary keys are `uuid` (generated with `gen_random_uuid()`), except for natural-key reference tables (`amenities.code`, `card_networks.code`), `provider_usage` (`provider`, `day`), and `airport_sightings.id` (`bigint` identity, for insert speed).
- Every curated table has `created_at` and `updated_at` (`timestamptz`, default `now()`). Pure link and reference tables (`record_sources`, `lounge_amenities`, `amenities`, `card_networks`, `policy_rules`) don't.
- Enums are Postgres enums managed in migrations: `verification_status`, `source_type`, `terminal_role`, `airline_operation`, `program_kind`, `policy_scope`, `lounge_scope`, `lounge_side`, `lounge_direction`.
- Codes are stored uppercase (IATA, ICAO), with check constraints such as `iata ~ '^[A-Z]{3}$'`; `icao24` is lowercase hex.
- All timestamps are UTC (`timestamptz`). `service_date` and `provider_usage.day` are the local (IST) date.

## Provenance mixin (P)

| Column | Type | Constraint |
|---|---|---|
| `verification_status` | enum `verification_status` (`verified`, `unverified`, `unavailable`) | not null, default `unverified` |
| `verified_at` | date | required when `verified` |
| `verified_by` | text | required when `verified` |
| `reverify_after_days` | int | not null; the seed fills it from `REVERIFY_DAYS` in `app/seed/bundle.py` when the file doesn't say (airports 365, terminals 180, terminal airlines 90, OSM terminals 90, lounges 60, lounge access methods 60, cards 60, card policies 60) |
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
| `osm_terminals` | unique `osm_ref` (check `^(node|way|relation)/[0-9]+$`); index `airport_id` |
| `airport_sightings` | unique (`airport_id`, `airline_icao`, `icao24`, `service_date`); index (`airport_id`, `service_date`); checks on `airline_icao` and `icao24` format |
| `lounges` | unique `slug`; index `airport_id` |
| `lounge_access_methods` | unique (`lounge_id`, `access_program_id`, `valid_from`); exclusion: no overlapping `daterange(valid_from, valid_to)` per (`lounge_id`, `access_program_id`), deferred |
| `access_programs` | unique `key` |
| `banks` | unique `slug` |
| `credit_cards` | unique `slug`; index `bank_id`, `network_code` (nullable since migration 0005: not every bank states the network) |
| `lounge_policies` | unique (`card_id`, `scope`, `valid_from`); exclusion: no overlapping `daterange(valid_from, valid_to)` per (`card_id`, `scope`), deferred; check `valid_to > valid_from` |
| `policy_rules` | unique (`policy_id`, `position`); check: `rule_type` in the known set (eight values since 0006); `rule` is validated by `app/eligibility/rules.py` before insert |
| `record_sources` | PK (`source_id`, `record_table`, `record_id`) |
| `source_checks` | index (`source_id`, `checked_at`). Not written yet (see above) |
| `provider_usage` | PK (`provider`, `day`); check `requests >= 0` |

## Required extensions

`postgis`, `pg_trgm`, `btree_gist`.

## Redis keys (not in Postgres, listed for completeness)

The free tier allows 500K commands a month, so Redis is used sparingly. The live snapshot, bbox filtering and rate limits are handled in API memory ([ADR-0012](../decisions/0012-zero-budget-hosting.md)). Redis is optional (`REDIS_URL` unset = every cache below stays in process memory), and it isn't connected in production yet.

| Key | Type | TTL | Written |
|---|---|---|---|
| `positions:snapshot` | string (JSON) | 5 min | At most once every 60 s, for warm starts |
| `route:{callsign}` | string (JSON) | 6 h | After each sweep, for up to 10 callsigns without a cached route (including "no route" answers) |
| `fares:v1:{routes}:{dates}:{passengers}:{cabin}:{currency}:{providers}` | string (JSON) | 10 min | On a fare search cache miss |
| `fares:v1:links:{provider}:{reference}` | string (JSON) | 10 min | First booking-links request per offer |
