# ADR-0005: Live updates — polling first

- Status: Proposed
- Date: 2026-11-13

## Context
Upstream position providers update about every 5–10 s, and the API refreshes its snapshot at most every 15 s ([ADR-0012](./0012-zero-budget-hosting.md)), so the data can't be fresher than that. Push channels (WebSocket or SSE) add connection state, scaling concerns on serverless and PaaS, and complexity.

## Decision
The browser polls `GET /api/v1/positions?bbox=` every 15 s with TanStack Query (paused when the tab is hidden). Responses are served from the API's in-memory snapshot, which is refreshed on demand, with short `Cache-Control` and ETag. We will revisit SSE if p95 freshness or request volume justifies it.

## Consequences
Simple, cache-friendly and stateless. Worst-case latency is about 30 s (refresh interval + poll interval), which is acceptable for this product. Client-side dead reckoning smooths the motion.
