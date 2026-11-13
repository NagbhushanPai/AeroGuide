# ADR-0003: Technology stack and tooling

- Status: Proposed
- Date: 2026-11-13

## Context
The project brief mandates the core stack. Tooling choices within it are still open.

## Decision
**Mandated (from the brief):** Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Lucide, MapLibre GL JS, TanStack Query; Python, FastAPI, Pydantic, SQLAlchemy, Alembic; PostgreSQL + PostGIS, Redis; Vercel, Render/Railway, Supabase, GitHub Actions.

**Chosen tooling:**
| Concern | Choice | Why |
|---|---|---|
| JS package manager | pnpm (workspace) | Fast, strict, good monorepo support |
| Python env and packaging | uv | Fast, lockfile, works on Windows |
| Python version | 3.12 | Available locally. Supported by all dependencies |
| DB driver | asyncpg + SQLAlchemy 2 async | Matches FastAPI's async model |
| Geo ORM | GeoAlchemy2 | Standard PostGIS types for SQLAlchemy |
| Lint and format | ruff (Python), ESLint + Prettier (TS) | Common defaults |
| Types | mypy strict (`app/`), `tsc --noEmit` strict | Catch contract drift |
| Tests | pytest, Hypothesis, respx; Vitest, Testing Library, Playwright | See the [testing strategy](../testing/testing-strategy.md) |
| API types for web | openapi-typescript + openapi-fetch | Small, generated, no runtime magic |

## Consequences
Contributors need Node 22+, pnpm, Python 3.12, uv and Docker. Exact versions are pinned in Stage 1 lockfiles.
