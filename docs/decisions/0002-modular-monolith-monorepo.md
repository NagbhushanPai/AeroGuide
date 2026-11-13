# ADR-0002: Modular monolith in a monorepo

- Status: Proposed
- Date: 2026-11-13

## Context
There are five feature areas (flights, airports, lounges, cards, eligibility), a small team, and a brief that rules out unnecessary microservices. Live ingestion has a different runtime profile from request serving.

## Decision
- One repository: `apps/web` (Next.js) and `apps/api` (FastAPI), plus `docs/` and `scripts/`.
- One Python codebase with domain modules and enforced layer boundaries (see the [backend architecture](../architecture/backend-architecture.md)). On the zero-budget deployment it runs as **one API process**. Live ingestion happens in-process on demand ([ADR-0012](./0012-zero-budget-hosting.md)), and scheduled jobs (`app/jobs/`) run from GitHub Actions ([ADR-0013](./0013-weekly-data-check.md)). The same code can run as a separate always-on worker if budget ever allows.
- Shared contract: OpenAPI from FastAPI → generated TypeScript types in `apps/web`.

## Consequences
- Simple local dev and atomic cross-stack changes.
- Ingestion and jobs share the domain code, so moving them into a separate process later needs no new codebase.
- Module boundaries must be enforced by tooling (`import-linter`), or the monolith will erode.
- A domain can be split out later if load requires it. The service layer is the seam.
