# Local development guide

Last updated: 2026-11-13 (Stage 1).

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 22+ | https://nodejs.org |
| pnpm | 10.33 (pinned via `packageManager`) | `corepack enable` |
| Python | 3.12 | https://www.python.org |
| uv | latest | `winget install astral-sh.uv` (Windows) or https://docs.astral.sh/uv/ |
| Docker Desktop | with Compose v2 | https://www.docker.com |
| make | optional | Not needed on Windows: every target has a `pnpm` script |

## First run

```bash
pnpm install                       # web dependencies (workspace root)
pnpm install:api                   # API dependencies (uv sync in apps/api)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm up                            # Postgres+PostGIS and Redis (docker compose)
pnpm migrate                       # alembic upgrade head
pnpm seed                          # load apps/api/data (airports, sources) into Postgres
```

Then, in two terminals:

```bash
pnpm dev:api    # http://localhost:8000/api/v1/docs  ·  health: /api/v1/health
pnpm dev:web    # http://localhost:3000
```

## Commands

| Make | pnpm (works everywhere) | What it does |
|---|---|---|
| `make up` / `make down` | `pnpm up` / `pnpm down` | Start or stop local services |
| `make migrate` | `pnpm migrate` | Apply migrations |
| `make seed` | `pnpm seed` | Load the reviewed YAML content into Postgres (idempotent) |
| `make seed-check` | `pnpm seed:check` | Validate the YAML content, no database needed |
| `make data-check` | `pnpm data-check` | Run the weekly data check locally (writes `apps/api/data-check-report.md`) |
| `make dev-web` / `make dev-api` | `pnpm dev:web` / `pnpm dev:api` | Dev servers |
| `make lint` | `pnpm lint` | ESLint + Ruff |
| `make fmt` | `pnpm fmt` | Prettier + Ruff format |
| `make typecheck` | `pnpm typecheck` | `tsc` + mypy |
| `make test` | `pnpm test` | Unit tests (Vitest + pytest) |
| `make test-integration` | `pnpm up && pnpm migrate && pnpm seed && pnpm test:api:integration` | API tests against real Postgres+PostGIS and Redis |
| `make build` | `pnpm build:web` | Production build of the web app |
| — | `pnpm --filter web test:e2e` | Playwright smoke tests (run `pnpm build:web` first; needs `pnpm --filter web exec playwright install chromium` once) |

## Environment variables

| App | Variable | Purpose |
|---|---|---|
| API | `ENVIRONMENT` | `local`, `test`, `preview` or `production` |
| API | `LOG_LEVEL` | Default `INFO` |
| API | `DATABASE_URL` | `postgresql+asyncpg://…`. Local default matches `docker-compose.yml` |
| API | `REDIS_URL` | `redis://…` locally, `rediss://…` for Upstash |
| API | `CORS_ORIGINS` | Comma-separated browser origins |
| Web | `API_BASE_URL` | API URL for server-side fetches |
| Web | `NEXT_PUBLIC_API_BASE_URL` | API URL for browser polling (not secret) |

Never commit `.env` files. Only `.env.example` files are tracked.

## Live map notes

- The web app reads live data from `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`). Run `pnpm dev:api` alongside `pnpm dev:web`. The API's `CORS_ORIGINS` must include the web origin.
- `pnpm --filter web gen:api` regenerates `src/lib/api/schema.d.ts` from the running API's OpenAPI schema. Run it after changing API schemas.
- `pnpm dev` and `pnpm build` in `apps/web` copy MapLibre's web worker into `public/vendor/` (git-ignored) first.
- Set `POSITION_PROVIDERS=demo` in `apps/api/.env` to work offline with clearly labelled simulated aircraft.
- The first request after the API starts waits for one upstream sweep (about 10 s). After that, data is served instantly and refreshed in the background once a minute.

## Airport data

- `apps/api/data/airports.yaml` and `apps/web/public/data/airports-in.geojson` are both generated from OurAirports by `python scripts/build_airport_data.py airports.csv` (see the script's docstring for the download URL). Regenerate them together.
- The integration tests' migration test downgrades to an empty database. Run `pnpm seed` again afterwards if you want data in your local database.
- The live map's airport search reads the static GeoJSON, so it works without the API. The `/airports` pages need the API and a seeded database.

## Notes

- **Next.js 16 with Cache Components** is enabled. Read the bundled docs in `apps/web/node_modules/next/dist/docs/` before writing data-fetching code (`use cache`, `<Suspense>`, async `params`). `next dev` regenerates `apps/web/AGENTS.md`, so commit it as is.
- Line endings are normalised to LF by `.gitattributes`.
- Local PostGIS is `17-3.7`. Supabase's PostGIS version may differ, so check it when deploying.
