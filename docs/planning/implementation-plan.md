# Implementation plan

Last updated: 2026-11-16. This was the detailed plan for Stage 1, kept as a record. Stages 2 to 6 were tracked in the [roadmap](./roadmap.md) and the [changelog](../../CHANGELOG.md) rather than in separate plans.

## Stage 1: Foundation (done)

Built as planned, with these differences: Docker Compose uses `postgis/postgis:17-3.7` and `redis:7.4-alpine`; the root `package.json` mirrors every Makefile target as a `pnpm` script for Windows shells; the first migration also enables `pg_trgm` and `btree_gist`; CI has a third job (secret scan) and `.env.example` files live per app, not at the root.

### Steps
1. **Repository tooling**
   - Add `.gitattributes` (LF line endings), `.editorconfig`, and a full `.gitignore` (Node, Python, env files, build output).
   - Add the root `package.json` with a **pnpm** workspace (`apps/web`).
   - Python managed with **uv** in `apps/api` (`pyproject.toml`, lockfile).
2. **apps/web**
   - Next.js (App Router, TypeScript strict), Tailwind CSS, shadcn/ui init, Lucide.
   - ESLint and Prettier, Vitest + Testing Library, Playwright scaffold.
   - Placeholder routes for every nav item, each rendering a real "coming in Stage N" empty state. No dead links.
   - `LICENSE` (MIT) is already in place from Stage 0.
3. **apps/api**
   - FastAPI app factory, settings via `pydantic-settings`, module layout per the [backend architecture](../architecture/backend-architecture.md). A single process, with no worker ([ADR-0012](../decisions/0012-zero-budget-hosting.md)).
   - SQLAlchemy 2.x async engine (asyncpg), Alembic initialised, with the first migration enabling the `postgis` extension.
   - Redis client. `GET /api/v1/health` reports DB, PostGIS and Redis status.
   - Ruff, mypy (strict on `app/`) and pytest with a test database.
4. **Infrastructure**
   - `docker-compose.yml` with `postgis/postgis:16-3.4` and `redis:7`, with health checks and named volumes.
   - Makefile targets: `dev`, `up`, `down`, `migrate`, `seed`, `test`, `lint`, `fmt`, `typecheck`.
   - `.env.example` at the root and per app. No real secrets.
5. **CI** (`.github/workflows/ci.yml`)
   - Jobs: `web` (install, lint, typecheck, test, build) and `api` (uv sync, ruff, mypy, pytest against service containers for Postgres+PostGIS and Redis).
6. **Docs:** a local development guide and README status update.

### Risks and dependencies
| Risk | Mitigation |
|---|---|
| Windows dev environment (paths, line endings) | `.gitattributes`, Docker for services, `uv` and `pnpm` both work on Windows |
| Docker Desktop not running | Health checks with a clear error in `make dev` |
| PostGIS version drift between local and Supabase | Pin the image. Supabase supports PostGIS. Check the version when deploying |
| Next.js and shadcn/ui version churn | Pin versions in the lockfile and record them in the README |
| Free-tier compatibility | Keep the API image small and stateless so Render free cold starts stay short. No paid-only services in Compose |

### Proposed commits
- `chore: initialise monorepo tooling`
- `chore(web): scaffold Next.js app with Tailwind and shadcn/ui`
- `chore(api): scaffold FastAPI app with settings, database and health check`
- `chore: add docker compose for postgis and redis`
- `ci: add web and api workflows`
- `docs: add local development guide and update status`
