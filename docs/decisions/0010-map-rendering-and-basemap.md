# ADR-0010: Map rendering and basemap

- Status: Proposed
- Date: 2026-11-13

## Context
The live map must render up to about 2,000 aircraft smoothly on mid-range phones, look consistent with a dark navy theme, and not depend on a paid tile key during development.

## Decision
- **Rendering:** MapLibre GL JS with a single GeoJSON source and a **symbol layer** (SDF aircraft icon, `icon-rotate` from track, altitude colour via a data-driven expression). Selection uses `feature-state`. No per-aircraft DOM markers.
- **Basemap, phase 1:** OpenFreeMap vector tiles (free, no API key, OSM data) with a custom dark style matching our tokens.
- **Basemap, phase 2 (if needed for performance or cost):** a self-hosted Protomaps PMTiles extract of India and its surroundings, on object storage behind a CDN.
- Required attribution (OpenStreetMap contributors, tile host, flight data sources) is always visible.

## Consequences
GPU rendering scales. There is no vendor key for tiles in development. A custom style needs maintenance. Self-hosting PMTiles later adds a build step and storage cost, but removes the third-party runtime dependency.
