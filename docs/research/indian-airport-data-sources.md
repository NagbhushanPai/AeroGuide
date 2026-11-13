# Indian airport data sources

Researched 2026-11-13. This file says where each airport fact *may* be sourced from. Nothing here is seed data: every seeded value must cite a specific URL and verification date (see [ADR-0006](../decisions/0006-content-provenance-and-verification.md)).

## Source hierarchy (most to least authoritative)

1. **Airport operator's official website or app.** Most Indian metro airports are run under PPP concessions, so the operator site is the authority for terminals, facilities, dining, retail and transport.
2. **Airports Authority of India (AAI), aai.aero.** Authority for AAI-operated airports, aerodrome identifiers and the AIP (AIP India: aerodrome data, ICAO codes, coordinates, runways).
3. **DGCA, dgca.gov.in.** Regulatory data and traffic statistics.
4. **Airline official websites.** Authority for which terminal *that airline* uses at an airport.
5. **Transport authorities.** Metro rail corporations (for example DMRC, Chennai Metro Rail, BMRCL) and state bus corporations for transport options.
6. **Secondary sources** (news, Wikipedia, OurAirports). Use them only to *find* a primary source. Never cite them as the source of a seeded fact. Exception: OurAirports (public domain) is acceptable for static geodata (coordinates, elevation, ICAO/IATA codes), cross-checked against the AIP.

## Initial seven airports: where to look

The operator is listed so we know where authoritative pages live. Confirm the operator before seeding; concession arrangements change.

| IATA | ICAO | Airport | Operator to confirm | Primary sources to check |
|---|---|---|---|---|
| DEL | VIDP | Indira Gandhi International, Delhi | Delhi International Airport Ltd (GMR-led) | Official airport website; AIP India |
| BOM | VABB | Chhatrapati Shivaji Maharaj International, Mumbai | Mumbai International Airport Ltd (Adani-led) | Official airport website; AIP India |
| BLR | VOBL | Kempegowda International, Bengaluru | Bangalore International Airport Ltd | Official airport website; AIP India |
| HYD | VOHS | Rajiv Gandhi International, Hyderabad | GMR Hyderabad International Airport Ltd | Official airport website; AIP India |
| MAA | VOMM | Chennai International | AAI | aai.aero airport page; AIP India |
| COK | VOCI | Cochin International, Kochi | Cochin International Airport Ltd (CIAL) | Official airport website; AIP India |
| JAI | VIJP | Jaipur International | Confirm (operator changed under the PPP programme) | Official airport website; AIP India |

## Fact categories and how often they change

| Category | Primary source | Expected change rate | Re-verify every |
|---|---|---|---|
| Codes, coordinates, elevation, time zone | AIP India / OurAirports | Rarely | 12 months |
| Terminals (existence, domestic/international role) | Operator site | Yearly | 6 months |
| Airline → terminal assignment | Airline site and operator site | **Often** (seasonal schedules, terminal moves) | 1–3 months |
| Lounges | Operator site and lounge operator | Often | 1–3 months |
| Dining and retail | Operator site | Often | 3 months |
| Transport (metro, bus, taxi) | Transport authority | Moderate | 6 months |
| Facilities (Wi-Fi, medical, prayer rooms, accessibility) | Operator site | Moderate | 6 months |

## Limitations

- **No unified machine-readable source.** Operator websites differ, are rendered by JavaScript, and change without notice. Data entry will be manual or semi-manual with human review.
- **Terminal assignments are often per flight**, not per airline. Example: one airline can use different terminals for different flight-number ranges. The model must allow `airline + terminal + optional scope note`.
- **Scraping:** we must check each site's terms and robots.txt. The default is manual curation with source links, not automated scraping.
- **Liability:** airport pages must say "check your boarding pass or the airline for the operative terminal".
