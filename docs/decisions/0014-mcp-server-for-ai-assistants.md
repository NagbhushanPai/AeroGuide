# ADR-0014: An MCP server for AI assistants

- Status: Accepted
- Date: 2026-11-14
- Supersedes: [ADR-0008](./0008-defer-ai-integration.md)

## Context
The owner wants an AI agent that can use AeroGuide's backend through the Model Context Protocol (MCP): call real tools, get verified information and complete multi-step travel tasks. The project still has a zero budget ([ADR-0012](./0012-zero-budget-hosting.md)), and the rules on provenance ([ADR-0006](./0006-content-provenance-and-verification.md)) and deterministic eligibility ([ADR-0009](./0009-deterministic-eligibility-engine.md)) still apply.

ADR-0008 kept the services tool-ready for this. Three ways to run the agent were considered:

| Option | Cost to the project | Notes |
|---|---|---|
| **Remote MCP server, people bring their own assistant** | $0 | The assistant's model runs on the user's own account. Claude's Free plan allows one custom connector |
| Our own hosted agent on a free-tier model API | $0 within small quotas | Quotas change without notice; some free tiers use requests for training, which conflicts with the checker's privacy promise |
| Local open-weights model | $0 | Runs only on the developer's machine; useful for evals, not for users |

## Decision
- **AeroGuide is an MCP server, not an agent host.** The FastAPI app serves MCP at `/mcp` (Streamable HTTP, stateless, JSON responses) using the official `mcp` Python SDK. Any MCP client can connect. The project runs no model and holds no model API key.
- **Tools are read-only wrappers around the existing services** (`app/mcp_server/server.py`). They return the same typed results as the REST API, including sources and verification status. Every tool is annotated read-only and non-destructive.
- **Eligibility comes only from the engine.** `check_lounge_access` calls the same service as `POST /eligibility`. The server's instructions tell assistants not to work out eligibility themselves, to report "depends" as depends, and to answer only from tool results with their sources.
- **Privacy holds.** Tool arguments are never stored or logged. The access check refuses unknown fields, as the REST endpoint does, so a card number can't be sent.
- **Abuse limits.** A per-client rate limit (`MCP_RATE_LIMIT_PER_MINUTE`, default 60) and DNS-rebinding protection with a Host allow-list (`MCP_ALLOWED_HOSTS`; Render's `RENDER_EXTERNAL_HOSTNAME` is added automatically). `MCP_ENABLED=false` turns the endpoint off.
- **No authentication for now.** Every tool reads public data. If a write tool or private data is ever added, it needs OAuth first.

Note (2026-11-16): built as decided (`app/mcp_server/`): 12 tools, all annotated read-only and non-destructive. Live-data tools are marked open-world and non-idempotent. The twelfth, `search_flights`, spends paid fare requests under its own daily cap ([ADR-0015](./0015-paid-fare-search-with-a-request-budget.md), addendum); it is still read-only.

## Consequences
- Users get an agent at no cost to the project, using whatever MCP client they already have.
- Answer quality depends on the user's assistant. The instructions and tool descriptions steer it, but we can't enforce how it phrases answers.
- On Render's free tier the API sleeps when idle, so the first call after a quiet spell may be slow or time out once.
- A hosted agent (our own model, our own chat page) remains possible later on the same tools, with its own decision record covering cost and privacy.
