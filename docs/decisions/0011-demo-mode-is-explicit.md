# ADR-0011: Demo mode is explicit, never an automatic fallback

- Status: Proposed
- Date: 2026-11-13

## Context
The brief requires a clearly labelled demo mode when credentials are unavailable, and forbids presenting simulated data as live. If a live provider fails and the system silently swaps in demo data, users could be misled even with a badge on screen.

## Decision
1. Demo data comes only from `DemoProvider`, enabled **only** by explicit config (`POSITION_PROVIDERS=demo`) or a dev-only query flag (`?demo=1`, disabled in production builds).
2. The demo provider is **never** part of the automatic failover chain. When real providers fail, the API returns `meta.mode = "degraded"` or `"unavailable"` with an explanation, not demo aircraft.
3. Demo aircraft are obviously synthetic: callsigns prefixed `DEMO`, registration `DEMO-…`, an `is_demo: true` flag on every feature, and positions on fictional tracks.
4. When any demo feature is shown, the UI shows a persistent **DEMO DATA** badge, and the flight panel shows "Simulated aircraft — not a real flight".

## Consequences
Users may sometimes see an empty map with an explanation instead of moving planes. That's acceptable. Demo mode stays useful for development, screenshots and tests without any risk of being mistaken for real data.
