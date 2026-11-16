# ADR-0010: Map rendering and basemap

- Status: Accepted
- Date: 2026-11-13

## Context
The live map must render up to about 2,000 aircraft smoothly on mid-range phones, look consistent with a dark navy theme, and not depend on a paid tile key during development.

## Decision
- **Rendering:** MapLibre GL JS with a single GeoJSON source and a **symbol layer** (SDF aircraft icon, `icon-rotate` from track, altitude colour via a data-driven expression). Selection uses `feature-state`. No per-aircraft DOM markers.
- **Basemap, phase 1:** OpenFreeMap vector tiles (free, no API key, OSM data) with a custom dark style matching our tokens.
- **Basemap, phase 2 (if needed for performance or cost):** a self-hosted Protomaps PMTiles extract of India and its surroundings, on object storage behind a CDN.
- Required attribution (OpenStreetMap contributors, tile host, flight data sources) is always visible.

Note (2026-11-16): rendering is as decided (`apps/web/src/components/live/live-map.tsx`: one GeoJSON source, symbol layer with an SDF icon, `icon-rotate` from `track_deg`, altitude colour expression, `feature-state` selection, no DOM markers). The basemap uses OpenFreeMap's hosted styles as they are, `dark` and `positron` (one per theme), instead of a custom style, so there is no style to maintain. An optional RainViewer radar raster overlay was added. Attribution comes from MapLibre's attribution control plus a data-credit line under the map. Phase 2 (PMTiles) has not been needed.

## Consequences
GPU rendering scales. There is no vendor key for tiles in development. A custom style needs maintenance. Self-hosting PMTiles later adds a build step and storage cost, but removes the third-party runtime dependency.
