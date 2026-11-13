# Entity relationship diagram

Last updated: 2026-11-13. Status: proposed. Column details are in the [schema](./schema.md) and [data dictionary](./data-dictionary.md).

Tables marked **(P)** use the `Provenance` mixin (`verification_status`, `verified_at`, `verified_by`, `reverify_after_days`, `primary_source_id`, `notes`) from [ADR-0006](../decisions/0006-content-provenance-and-verification.md). The mixin columns are left out of the diagram for readability.

## Airports, terminals and aviation reference

```mermaid
erDiagram
  SOURCES ||--o{ RECORD_SOURCES : cited_by
  SOURCES ||--o{ SOURCE_CHECKS : checked_by
  AIRPORTS ||--o{ TERMINALS : has
  AIRPORTS ||--o{ AIRPORT_FACILITIES : offers
  AIRPORTS ||--o{ AIRPORT_TRANSPORT : served_by
  TERMINALS ||--o{ TERMINAL_AIRLINES : hosts
  AIRLINES ||--o{ TERMINAL_AIRLINES : operates_from
  TERMINALS ||--o{ AIRPORT_OUTLETS : contains
  TERMINALS ||--o{ AIRPORT_FACILITIES : located_in
  AIRCRAFT_TYPES ||--o{ AIRCRAFT : classifies
  AIRLINES ||--o{ AIRCRAFT : operates

  AIRPORTS {
    uuid id PK
    char3 iata UK
    char4 icao UK
    text name
    text city
    text state
    text region
    geography location
    text timezone
  }
  TERMINALS {
    uuid id PK
    uuid airport_id FK
    text code
    text name
    enum role "domestic|international|mixed"
  }
  TERMINAL_AIRLINES {
    uuid id PK
    uuid terminal_id FK
    uuid airline_id FK
    enum operation "domestic|international|both"
    text scope_note
    date valid_from
    date valid_to
  }
  AIRLINES {
    uuid id PK
    char2 iata
    char3 icao UK
    text name
    text callsign
    text country_iso
  }
  AIRCRAFT_TYPES {
    text icao_code PK
    text manufacturer
    text model
  }
  AIRCRAFT {
    char6 icao24 PK
    text registration
    text type_code FK
    uuid operator_airline_id FK
  }
  AIRPORT_FACILITIES {
    uuid id PK
    uuid airport_id FK
    uuid terminal_id FK
    text category
    text name
    text location_text
  }
  AIRPORT_TRANSPORT {
    uuid id PK
    uuid airport_id FK
    enum mode "metro|rail|bus|taxi|app_cab|car_rental|parking"
    text operator
    text description
  }
  AIRPORT_OUTLETS {
    uuid id PK
    uuid terminal_id FK
    enum kind "dining|shopping|service"
    text name
    text category
    enum zone "airside|landside|arrivals"
    text location_text
  }
  SOURCES {
    uuid id PK
    text name
    text url
    enum source_type
    timestamptz retrieved_at
    text archived_url
  }
  RECORD_SOURCES {
    uuid source_id FK
    text record_table
    uuid record_id
  }
  SOURCE_CHECKS {
    uuid id PK
    uuid source_id FK
    timestamptz checked_at
    int http_status
    text final_url
    text content_hash
    bool changed
  }
```

## Flights

```mermaid
erDiagram
  AIRLINES ||--o{ FLIGHTS : markets
  AIRPORTS ||--o{ FLIGHTS : origin
  AIRPORTS ||--o{ FLIGHTS : destination
  AIRCRAFT ||--o{ FLIGHTS : flown_by
  AIRCRAFT ||--o{ FLIGHT_POSITIONS : reports

  FLIGHTS {
    uuid id PK
    text flight_number
    date service_date
    uuid airline_id FK
    text callsign
    uuid origin_airport_id FK
    uuid destination_airport_id FK
    char6 aircraft_icao24 FK
    timestamptz first_seen
    timestamptz last_seen
    timestamptz sched_dep
    timestamptz est_dep
    timestamptz sched_arr
    timestamptz est_arr
    enum status "airborne|on_ground|not_tracked|unknown"
    text source
    timestamptz fetched_at
  }
  FLIGHT_POSITIONS {
    bigint id PK
    char6 icao24
    timestamptz position_time
    geography position
    int alt_baro_ft
    real gs_kt
    real track_deg
    int vrate_fpm
    bool on_ground
    text callsign
    text source
  }
```

`flights` holds **observed** movements from open data (OpenSky first-seen and last-seen times, reported routes). The `sched_*` and `est_*` columns stay `null` while only open sources are used. They exist so a schedule source could be added later without a migration.

`flight_positions` is partitioned by day on `position_time` and has no FK to `aircraft`, so ingestion doesn't depend on reference data. **It is disabled on the zero-budget deployment** ([ADR-0012](../decisions/0012-zero-budget-hosting.md)). Trails come from memory instead.

## Lounges and cards

```mermaid
erDiagram
  AIRPORTS ||--o{ LOUNGES : has
  TERMINALS ||--o{ LOUNGES : located_in
  LOUNGES ||--o{ LOUNGE_AMENITIES : offers
  AMENITIES ||--o{ LOUNGE_AMENITIES : tagged
  LOUNGES ||--o{ LOUNGE_ACCESS_METHODS : accepts
  ACCESS_PROGRAMS ||--o{ LOUNGE_ACCESS_METHODS : accepted_via
  BANKS ||--o{ CREDIT_CARDS : issues
  CARD_NETWORKS ||--o{ CREDIT_CARDS : runs_on
  CREDIT_CARDS ||--o{ CARD_VARIANTS : has
  CARD_VARIANTS ||--o{ LOUNGE_POLICIES : governed_by
  LOUNGE_POLICIES ||--o{ POLICY_RULES : contains
  ACCESS_PROGRAMS ||--o{ POLICY_RULES : entitles
  LOUNGE_POLICIES |o--o| LOUNGE_POLICIES : superseded_by

  LOUNGES {
    uuid id PK
    text slug UK
    uuid airport_id FK
    uuid terminal_id FK
    text name
    text operator
    enum scope "domestic|international|both"
    enum side "airside|landside"
    text location_text
    text nearest_gate
    jsonb opening_hours
    text food_beverage
    geography location
  }
  AMENITIES {
    text code PK
    text label
  }
  LOUNGE_AMENITIES {
    uuid lounge_id FK
    text amenity_code FK
  }
  ACCESS_PROGRAMS {
    uuid id PK
    text code UK
    text name
    enum kind "membership|network|bank|airline|paid"
  }
  LOUNGE_ACCESS_METHODS {
    uuid id PK
    uuid lounge_id FK
    uuid access_program_id FK
    numeric paid_price
    char3 currency
    int paid_duration_min
    date valid_from
    date valid_to
  }
  BANKS {
    uuid id PK
    text slug UK
    text name
  }
  CARD_NETWORKS {
    text code PK
    text name
  }
  CREDIT_CARDS {
    uuid id PK
    text slug UK
    uuid bank_id FK
    text network_code FK
    text name
    text product_url
  }
  CARD_VARIANTS {
    uuid id PK
    uuid card_id FK
    text name
  }
  LOUNGE_POLICIES {
    uuid id PK
    uuid card_variant_id FK
    enum scope "domestic|international"
    date valid_from
    date valid_to
    uuid superseded_by_id FK
    text summary
  }
  POLICY_RULES {
    uuid id PK
    uuid policy_id FK
    text rule_type
    jsonb rule
    uuid access_program_id FK
  }
```

Lounges, lounge access methods, credit cards and lounge policies are (P) tables. So are airports, terminals, terminal airlines, facilities, transport and outlets.
