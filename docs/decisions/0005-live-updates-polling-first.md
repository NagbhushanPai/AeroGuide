# ADR-0005: Live updates — polling first

- Status: Proposed
- Date: 2026-11-13

## Context
Upstream community feeds limit how often we can sweep India: the API refreshes its snapshot at most once a minute ([ADR-0012](./0012-zero-budget-hosting.md)), so the data can't be fresher than that. Push channels (WebSocket or SSE) add connection state, scaling concerns on serverless and PaaS, and complexity.

## Decision
The browser polls `GET /api/v1/positions?bbox=` every 15 s with TanStack Query (paused when the tab is hidden). Responses are served from the API's in-memory snapshot, which is refreshed on demand, with short `Cache-Control` and ETag. We will revisit SSE if p95 freshness or request volume justifies it.

## Consequences
Simple, cache-friendly and stateless. Positions are normally 0-70 s old, plus up to 15 s of polling delay. That's acceptable for this product, and every position shows its age. Client-side dead reckoning to smooth motion between updates is planned, not built.
