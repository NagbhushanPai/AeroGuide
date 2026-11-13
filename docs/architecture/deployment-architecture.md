# Deployment architecture

Last updated: 2026-11-13. Status: proposed. Nothing is deployed yet. **Budget: $0** ([ADR-0012](../decisions/0012-zero-budget-hosting.md)).

```mermaid
flowchart TB
  GH[GitHub repo: public] -->|PR| CI[GitHub Actions CI<br/>lint · types · tests · build]
  CI -->|preview| VP[Vercel preview]
  CI -->|main green| VD[Vercel Hobby<br/>apps/web]
  CI -->|main green → deploy hook| RA[Render free web service<br/>apps/api]
  CRON[GitHub Actions<br/>weekly-data-check.yml] -->|read-only| SB
  RA -->|pre-deploy: alembic upgrade head| SB[(Supabase free<br/>Postgres + PostGIS)]
  RA --> RD[(Upstash Redis free)]
```

| Component | Target (free tier) | Notes |
|---|---|---|
| Web | Vercel Hobby | Root `apps/web`. Non-commercial use only, which matches AeroGuide. Content pages are static or ISR, so they work while the API sleeps |
| API | Render free web service | Docker image from `apps/api`. Sleeps after 15 min idle, about 1 min cold start. Health check at `/api/v1/health`. Pre-deploy runs migrations |
| Postgres | Supabase free | 500 MB, PostGIS enabled. Pauses after 1 week without DB activity ([ADR-0013](../decisions/0013-weekly-data-check.md) covers this risk) |
| Redis | Upstash free | 500K commands a month. **No payment card added**, so it can't upgrade to paid usage |
| Jobs | GitHub Actions (free for public repos) | Weekly data check. CI |
| Map tiles | OpenFreeMap | Free, no key |

There is **no background worker** (Render has no free one). Live ingestion runs on demand inside the API.

## Environments

`local` (Docker Compose: Postgres+PostGIS, Redis) → `preview` (Vercel previews against the same free API) → `production`.

## Secrets

Secrets live only in the Vercel, Render and GitHub Actions secret stores: `DATABASE_URL`, `DATABASE_URL_READONLY`, `REDIS_URL`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`. `.env.example` documents every variable without values. gitleaks runs in CI.

## Free-tier risks

| Risk | Mitigation |
|---|---|
| API cold start (about 1 min) | Static content pages. A "waking up" state on `/live`. Warm-start snapshot from Redis |
| Supabase pause after 7 idle days | Normal traffic plus the weekly job. Optional twice-weekly keep-alive (owner decision) |
| Upstash command cap | In-memory first. Redis writes capped at about 1 a minute plus cache misses |
| Free-tier terms change | Re-check pricing pages at each deploy. This doc and ADR-0012 list the limits we depend on |
