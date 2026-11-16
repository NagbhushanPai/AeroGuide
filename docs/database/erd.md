# Entity relationship diagram

Last updated: 2026-11-16. Status: implemented (migrations 0001-0007). Column details are in the [schema](./schema.md) and [data dictionary](./data-dictionary.md).

Tables marked **(P)** use the `Provenance` mixin (`verification_status`, `verified_at`, `verified_by`, `reverify_after_days`, `primary_source_id`, `notes`) from [ADR-0006](../decisions/0006-content-provenance-and-verification.md). The mixin columns and `created_at` / `updated_at` are left out of the diagram for readability.

## Airports, terminals and sources

```mermaid
erDiagram
  SOURCES ||--o{ RECORD_SOURCES : cited_by
  SOURCES ||--o{ SOURCE_CHECKS : checked_by
  SOURCES |o--o{ AIRPORTS : official_website
  AIRPORTS ||--o{ TERMINALS : has
  TERMINALS ||--o{ TERMINAL_AIRLINES : hosts
  AIRLINES ||--o{ TERMINAL_AIRLINES : operates_from
  AIRPORTS ||--o{ OSM_TERMINALS : mapped_in_osm
  AIRPORTS ||--o{ AIRPORT_SIGHTINGS : seen_at

  AIRPORTS {
    uuid id PK
    char3 iata UK
    char4 icao UK
    text name
    text city
    text state
    text region
    geography location
    int elevation_ft
    text timezone
    text size "large|medium|small"
    bool has_guide
    uuid official_source_id FK
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
    char3 icao UK
    char2 iata
    text name
    text callsign
    char2 country_iso
  }
  OSM_TERMINALS {
    uuid id PK
    uuid airport_id FK
    text osm_ref UK
    text name
    text ref
    geography location
  }
  AIRPORT_SIGHTINGS {
    bigint id PK
    uuid airport_id FK
    char3 airline_icao
    text airline_name
    char6 icao24
    text callsign
    date service_date
    timestamptz first_seen
    timestamptz last_seen
    text source
  }
  SOURCES {
    uuid id PK
    text key UK
    text name
    text url
    text publisher
    enum source_type
    date retrieved_at
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
    text error
  }
```

`osm_terminals` (OpenStreetMap, always `unverified`) and `airport_sightings` (aircraft seen in the live ADS-B snapshot, written by the API, kept 45 days) are deliberately separate from the curated `terminals` and `terminal_airlines`, so mapped or observed data can never be mistaken for a verified terminal assignment.

## Flights

There are no flight tables. Live positions are held in API memory only ([ADR-0012](../decisions/0012-zero-budget-hosting.md)); the `flights` and `flight_positions` tables from the first proposal, like the aircraft reference tables, were not built.

## Lounges and cards

```mermaid
erDiagram
  AIRPORTS ||--o{ LOUNGES : has
  LOUNGES ||--o{ LOUNGE_AMENITIES : offers
  AMENITIES ||--o{ LOUNGE_AMENITIES : tagged
  LOUNGES ||--o{ LOUNGE_ACCESS_METHODS : accepts
  ACCESS_PROGRAMS ||--o{ LOUNGE_ACCESS_METHODS : accepted_via
  BANKS ||--o{ CREDIT_CARDS : issues
  CARD_NETWORKS |o--o{ CREDIT_CARDS : runs_on
  CREDIT_CARDS ||--o{ LOUNGE_POLICIES : governed_by
  LOUNGE_POLICIES ||--o{ POLICY_RULES : contains
  ACCESS_PROGRAMS |o--o{ POLICY_RULES : entitles

  LOUNGES {
    uuid id PK
    text slug UK
    uuid airport_id FK
    text terminal
    text name
    text operator
    enum scope "domestic|international|both"
    enum side "airside|landside"
    enum direction "departures|arrivals|transit"
    text location_text
    text nearest_gate
    jsonb opening_hours
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
    text key UK
    text name
    enum kind "membership|network|bank|airline|paid"
    text url
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
    text url
  }
  CARD_NETWORKS {
    text code PK
    text name
  }
  CREDIT_CARDS {
    uuid id PK
    text slug UK
    uuid bank_id FK
    text network_code FK "nullable"
    text name
    text product_url
  }
  LOUNGE_POLICIES {
    uuid id PK
    uuid card_id FK
    enum scope "domestic|international"
    date valid_from
    date valid_to
    text summary
    text unmodelled_terms
  }
  POLICY_RULES {
    uuid id PK
    uuid policy_id FK
    int position
    text rule_type
    jsonb rule
    uuid access_program_id FK
  }
```

A card variant with different benefits is its own `credit_cards` row, so policies hang off the card directly. Versions of a policy are linked by their dates: no overlap per (`card_id`, `scope`) is enforced by an exclusion constraint.

## Usage

```mermaid
erDiagram
  PROVIDER_USAGE {
    text provider PK
    date day PK
    int requests
    timestamptz updated_at
  }
```

Upstream requests per paid provider per IST day; the fare search budget ([ADR-0015](../decisions/0015-paid-fare-search-with-a-request-budget.md)).

(P) tables: airports, terminals, terminal airlines, OSM terminals, lounges, lounge access methods, credit cards and lounge policies.
