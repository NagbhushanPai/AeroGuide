# Implementation plan

Last updated: 2026-11-13. This is the detailed plan for the **next** stage. Later stages are summarised in the [roadmap](./roadmap.md) and get their own detailed plan when they start.

## Stage 1: Foundation (pending approval)

### Steps
1. **Repository tooling**
   - Add `.gitattributes` (LF line endings), `.editorconfig`, and a full `.gitignore` (Node, Python, env files, build output).
   - Add the root `package.json` with a **pnpm** workspace (`apps/web`).
   - Python managed with **uv** in `apps/api` (`pyproject.toml`, lockfile).
2. **apps/web**
   - Next.js (App Router, TypeScript strict), Tailwind CSS, shadcn/ui init, Lucide.
   - ESLint and Prettier, Vitest + Testing Library, Playwright scaffold.
   - Placeholder routes for every nav item, each rendering a real "coming in Stage N" empty state. No dead links.
3. **apps/api**
   - FastAPI app factory, settings via `pydantic-settings`, module layout per the [backend architecture](../architecture/backend-architecture.md).
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

### Proposed commits
- `chore: initialise monorepo tooling`
- `chore(web): scaffold Next.js app with Tailwind and shadcn/ui`
- `chore(api): scaffold FastAPI app with settings, database and health check`
- `chore: add docker compose for postgis and redis`
- `ci: add web and api workflows`
- `docs: add local development guide and update status`
