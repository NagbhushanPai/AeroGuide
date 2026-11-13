# Data dictionary

Last updated: 2026-11-13. Status: proposed. The meaning of each non-obvious field, plus the rules that keep it honest. Columns with obvious meanings (`name`, `created_at`) are left out.

## Shared

| Field | Meaning |
|---|---|
| `verification_status` | `verified`: checked against a primary source on `verified_at`. `unverified`: entered from a secondary lead or not yet checked. `unavailable`: we looked and no reliable source exists. The API adds a computed `outdated` when the re-verify window has passed |
| `reverify_after_days` | How long a verification is trusted before the record shows as outdated |
| `valid_from` / `valid_to` | Period during which a versioned fact is in force (inclusive start, exclusive end). `valid_to = null` means current |
| `source` (on flight rows) | Name of the provider adapter that produced the row, for example `adsb.lol` or `demo` |

## Airports

| Table.field | Meaning |
|---|---|
| `airports.region` | Grouping used by directory filters: North, Central, East, West, South, North-East. Follows the Zonal Councils (States Reorganisation Act, 1956) plus the North Eastern Council. Island union territories are grouped with the South. Mapping: `apps/api/app/core/india.py` |
| `airports.size` | OurAirports size class. Orders the directory, large first |
| `airports.has_guide` | A curated guide file exists for the airport (`data/airport_guides/{IATA}.yaml`) |
| `airports.official_source_id` | The operator's official website, where travellers should confirm details. `null` when it isn't confirmed |
| `airports` provenance | Geodata comes from OurAirports, a secondary source, so every airport is `unverified` until cross-checked against AIP India |
| `sources.key` | Stable handle used by the seed files, for example `del-official` |
| `airports.location` | Aerodrome reference point, `geography(Point,4326)` |
| `airports.timezone` | IANA zone, `Asia/Kolkata` for all initial airports |
| `terminals.role` | Main use of the terminal *as published by the operator* |
| `terminal_airlines.operation` | Whether the airline uses this terminal for domestic flights, international flights or both |
| `terminal_airlines.scope_note` | Free text for partial assignments, for example "flights 6E 2000–2999 only". **Copied from the source wording, not inferred** |
| `airport_outlets.zone` | `airside` (after security), `landside` (before security), `arrivals` |
| `airport_facilities.category` | For example `wifi`, `medical`, `prayer_room`, `accessibility`, `baggage_wrap`, `forex`, `pharmacy` |

## Open data about airports

| Table.field | Meaning |
|---|---|
| `osm_terminals` | A terminal building mapped in OpenStreetMap (`aeroway=terminal` inside the aerodrome). Named passenger terminals only; cargo, freight, general-aviation and VIP buildings are left out by name. Always `unverified` |
| `osm_terminals.osm_ref` | The OSM element, for example `way/51419058`, linked as `https://www.openstreetmap.org/way/51419058` |
| `airport_sightings` | One aircraft of one airline seen at one airport on one IST day: on the ground, or below 3,000 ft within 6 km of the reference point, in the live ADS-B snapshot. An observation while the live service ran; never a schedule or terminal claim |
| `airport_sightings.airline_icao` | The callsign's three-letter prefix when it's followed by a digit (`IGO6123` → `IGO`). Registrations and other callsigns are ignored |
| `airport_sightings.airline_name` | From the community route lookup when one was made for that callsign. Often `null` |

## Flights

| Table.field | Meaning |
|---|---|
| `flights.flight_number` | Marketed IATA designator, for example `AI101` |
| `flights.callsign` | ATC callsign as broadcast, for example `AIC101`. Can differ from the flight number |
| `flights.service_date` | Scheduled local departure date |
| `flights.status` | Observed state only: `airborne`, `on_ground`, `not_tracked`, `unknown`. Airline statuses (delayed, cancelled, diverted) are **not available** from open sources and are never inferred |
| `flights.first_seen` / `last_seen` | First and last ADS-B observation for the movement (OpenSky). **Not** scheduled or actual block times |
| `flights.sched_*`, `est_*` | Always `null` while only open sources are used |
| `flight_positions.alt_baro_ft` | Barometric altitude, in feet. `null` if not reported. `on_ground = true` overrides it |
| `flight_positions.gs_kt` | Ground speed, in knots |
| `flight_positions.track_deg` | Track over ground, in degrees true |
| `flight_positions.vrate_fpm` | Vertical rate, in feet per minute |

## Lounges

| Table.field | Meaning |
|---|---|
| `lounges.scope` | Which passengers can use the lounge (domestic departures, international departures or both) |
| `lounges.side` | `airside` or `landside` |
| `lounges.location_text` | Location wording quoted from the source |
| `lounges.nearest_gate` | Only filled when the source states it |
| `lounges.opening_hours` | JSON `{ "mode": "24h" }` or `{ "mode": "weekly", "periods": [{ "days": [...], "open": "HH:MM", "close": "HH:MM" }] }`, or `null` = not verified |
| `lounge_amenities` | Present only if the source states the amenity. **A missing tag means "not stated", not "not available"** |
| `access_programs.kind` | `membership` (for example Priority Pass), `network` (card network programmes), `bank`, `airline` (class or status), `paid` (walk-in) |
| `lounge_access_methods` | The lounge **accepts** this programme over the validity window. It says nothing about any card's entitlement |

## Cards

| Table.field | Meaning |
|---|---|
| `credit_cards.product_url` | Issuer's official product page |
| `card_variants.name` | A sub-product with different benefits, for example a metal edition or a network variant |
| `lounge_policies.scope` | Domestic or international benefit (separate versions) |
| `lounge_policies.summary` | Short human summary, written from the source and shown in the UI |
| `policy_rules.rule_type` | `visit_quota`, `spend_gate`, `guest_allowance`, `program_entitlement`, `airport_restriction`, `entry_method` |
| `policy_rules.rule` | Typed JSON for the rule. Example `visit_quota`: `{ "count": 2, "period": "quarter" }`. Example `spend_gate`: `{ "amount": 50000, "currency": "INR", "window": "previous_calendar_quarter", "ambiguous": false }`. The amounts here are illustrative only, not real card data |
| `policy_rules.access_program_id` | For `program_entitlement`: which programme the card unlocks |
| `policy_rules.rule.ambiguous` | The bank's wording can be read more than one way. The rule can never produce a plain "yes" |
| `policy_rules.position` | Order of the rules as written in the seed file |
| `lounge_policies.unmodelled_terms` | Bank wording no rule type captures, quoted. Makes every answer for that version "depends" |
| `lounges.terminal` | Terminal as the source names it (free text; curated terminals may not exist yet) |
| `credit_cards` (variants) | A variant with different benefits (for example a metal edition) is its own card |
