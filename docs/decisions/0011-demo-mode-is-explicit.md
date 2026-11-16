# ADR-0011: Demo mode is explicit, never an automatic fallback

- Status: Accepted
- Date: 2026-11-13

## Context
The brief requires a clearly labelled demo mode when credentials are unavailable, and forbids presenting simulated data as live. If a live provider fails and the system silently swaps in demo data, users could be misled even with a badge on screen.

## Decision
1. Demo data comes only from `DemoProvider`, enabled **only** by explicit config (`POSITION_PROVIDERS=demo`) or a dev-only query flag (`?demo=1`, disabled in production builds).
2. The demo provider is **never** part of the automatic failover chain. When real providers fail, the API returns `meta.mode = "degraded"` or `"unavailable"` with an explanation, not demo aircraft.
3. Demo aircraft are obviously synthetic: callsigns prefixed `DEMO`, registration `DEMO-…`, an `is_demo: true` flag on every feature, and positions on fictional tracks.
4. When any demo feature is shown, the UI shows a persistent **DEMO DATA** badge, and the flight panel shows "Simulated aircraft — not a real flight".

Note (2026-11-16): built as decided, with one omission and one extension. The `?demo=1` query flag was not built: demo data comes only from `POSITION_PROVIDERS=demo`, and the registry refuses that value alongside any real provider. The API answers with `meta.mode = "demo"` and "Simulated aircraft for testing. These are not real flights."; the UI shows a "Demo data" badge in the live status and in the flight panel of every `is_demo` aircraft. The same rule covers fare search: `FARE_PROVIDERS=mock` runs alone and every offer and page is labelled demo ([ADR-0015](./0015-paid-fare-search-with-a-request-budget.md)).

## Consequences
Users may sometimes see an empty map with an explanation instead of moving planes. That's acceptable. Demo mode stays useful for development, screenshots and tests without any risk of being mistaken for real data.
