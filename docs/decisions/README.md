# Architecture decision records

Format: [ADR-0001](./0001-record-architecture-decisions.md). Statuses: Proposed → Accepted → (Superseded by NNNN | Deprecated).

| # | Title | Status |
|---|---|---|
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](./0002-modular-monolith-monorepo.md) | Modular monolith in a monorepo | Accepted |
| [0003](./0003-technology-stack-and-tooling.md) | Technology stack and tooling | Accepted |
| [0004](./0004-flight-provider-abstraction.md) | Flight provider abstraction and data classes | Accepted |
| [0005](./0005-live-updates-polling-first.md) | Live updates: polling first | Accepted |
| [0006](./0006-content-provenance-and-verification.md) | Content provenance and verification | Accepted |
| [0007](./0007-content-as-reviewed-seed-files.md) | Content as reviewed seed files | Accepted |
| [0008](./0008-defer-ai-integration.md) | Defer AI integration; keep services tool-ready | Superseded by 0014 |
| [0009](./0009-deterministic-eligibility-engine.md) | Deterministic, versioned eligibility engine | Accepted |
| [0010](./0010-map-rendering-and-basemap.md) | Map rendering and basemap | Accepted |
| [0011](./0011-demo-mode-is-explicit.md) | Demo mode is explicit, never an automatic fallback | Accepted |
| [0012](./0012-zero-budget-hosting.md) | Zero-budget hosting and on-demand ingestion | Accepted |
| [0013](./0013-weekly-data-check.md) | Weekly data check job | Accepted |
| [0014](./0014-mcp-server-for-ai-assistants.md) | An MCP server for AI assistants | Accepted |
| [0015](./0015-paid-fare-search-with-a-request-budget.md) | Fare search from a paid API, within a hard request budget | Accepted |

ADRs 0002-0014 were marked Accepted on 2026-11-16 after checking each decision against the deployed code. Where the implementation differs from the original decision, the ADR carries a dated note saying what was built instead.
