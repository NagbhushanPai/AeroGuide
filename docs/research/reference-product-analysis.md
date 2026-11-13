# Reference product analysis

| | |
|---|---|
| Inspected | 2026-11-13 |
| Purpose | Functional and UX reference for AeroGuide. **We use it for function and UX only.** We do not copy its code, branding, copy, assets or data. |

## How it was inspected

- Pages fetched: `/`, `/airport/del`, `/lounge-access`, `robots.txt`, `sitemap.xml`.
- The public JS bundle was skimmed for the host names it calls and its UI concepts (data source badges, demo mode, staleness). No code was kept.
- `robots.txt` disallows `/api/`. We did not call the reference product's API and we will not scrape its data.

## Information architecture

| Area | Reference URL | What it holds |
|---|---|---|
| Live map | `/` | Full-screen radar map over India. The map is the home page. |
| Airport guides | `/airports`, `/airport/{iata}` (16 airports: DEL, BOM, BLR, HYD, MAA, CCU, COK, AMD, GOX, GOI, PNQ, JAI, LKO, GAU, TRV, IXC) | Terminal by airline, lounges, food and shops (after security, before security, arrivals), links to other airports |
| Lounge access by card | `/lounge-access`, `/lounge-access/{bank}` (about 20 banks, about 88 cards) | Per-bank tables of cards with domestic visits, unlock condition and international access |
| Flight pages | `sitemap-flights.xml` is referenced but returned empty on inspection | Probably per-flight SEO pages |

Navigation is minimal: three text links (live map, airport guides, lounge access by card).

## Live flight tracker: observed behaviour

- **Map-first and full screen.** The map renders before any chrome. Fast first paint is a stated priority: they preconnect only to the tile host.
- **Basemap.** A self-hosted India vector tileset (Protomaps PMTiles on object storage), plus Esri dark canvas and satellite layers. A 3D view uses OpenFreeMap buildings and terrain tiles.
- **Position sources** referenced in the bundle: adsb.lol, adsb.fi and the OpenSky Network.
- **Tap an aircraft** to open a "boarding-pass card": route, ETA, aircraft type and punctuality history.
- **Top bar counters:** In Air, Delayed, Scheduled. Clicking a counter filters the map.
- **Data-honesty UI:**
  - A source badge on each flight.
  - A distinct **Demo Mode** with a "SIM" badge ("Not a real flight").
  - A staleness indicator based on time since the last fix.
  - ETA is suppressed when the source is demo, "usual" or timetable rather than live.
- **Extras:** a watch list (★) with delay, departure and landing notices while the tab is open; a command or search bar that understands phrases like "delayed only" or "in air"; an intro tour.

## Airport pages: observed content model

1. Departure terminal by airline. These are labelled "typical", carry a check date and say the boarding pass is authoritative.
2. Lounge list. Per lounge: terminal, location, domestic or international, hours, access methods (Priority Pass, eligible cards, business class, walk-in) and walk-in price. The list has its own check date.
3. Food and shops grouped by category, with terminal, split into after security, before security and arrivals.
4. Ground transport is mentioned briefly: prepaid taxi and city bus at arrivals.

## Lounge-by-card page: observed content model

- Grouped by bank, with one table per bank. Columns: card (with variants), domestic lounges (quota and period), condition (spend gate), international.
- **Verification state on each row.** Rows are either "checked {date}" with a link to the bank, or "not re-checked: verify with the bank" with a third-party source.
- Dated rule-change notes, for example new spend gates or discontinued programmes.
- **There is no search, filter or eligibility checker.** Users scan the tables.

## Responsive behaviour

- The viewport is set with `viewport-fit=cover` and a theme colour, and the site has a web manifest. It is built as a mobile-first app.
- Content pages are a single centred column (max width about 760 px) of plain tables.

## What AeroGuide adopts

| Pattern | Why |
|---|---|
| Map-first live page with fast first paint | It is the core value. Slow maps lose users. |
| Source badge, explicit demo mode and staleness indicator on every flight | Matches our data-integrity rules |
| Suppressing ETA when the data isn't live | Avoids implying precision we don't have |
| Verification date and source on every changeable fact | Lounge and card rules change often |
| "Typical terminal, boarding pass is authoritative" framing | Terminal assignments change |

## Where AeroGuide differs

| Gap in the reference | AeroGuide approach |
|---|---|
| No search or filters on card tables | Searchable, filterable card directory with comparison |
| No eligibility checker | Deterministic backend rules engine with versioned policies |
| Lounges only appear on airport pages | A dedicated `/lounges` directory and `/lounge/[slug]` pages with amenity filters |
| Lounge *acceptance* and card *entitlement* sit in one table | Modelled separately: a lounge accepts programme X, and a card entitles you to programme X under conditions |
| Minimal navigation | Five-section navigation, homepage with flight search |
| Flat content pages | Structured directory and dashboard layouts |

## Things we must not do

- Reuse the reference product's name, wordmark, fonts, colours, copy or screenshots.
- Copy its airport, lounge or card datasets. Every AeroGuide fact must trace to a primary source (see the [data-source research](./indian-airport-data-sources.md)).
- Call its `/api/` endpoints.
