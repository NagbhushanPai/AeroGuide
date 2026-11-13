# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added (Stage 1: foundation)
- pnpm workspace, Makefile with matching pnpm scripts, `.gitattributes`, `.editorconfig`, `.env.example` files.
- `apps/web`: Next.js 16 (App Router, Cache Components), Tailwind CSS v4, shadcn/ui (Radix), Lucide, TanStack Query provider, dark navy theme tokens, header, nav, footer, placeholder pages for every nav item, not-found and error pages, Vitest and Playwright smoke tests.
- `apps/api`: FastAPI app factory, settings, JSON logging, async SQLAlchemy engine, Redis client, `GET /api/v1/health` (database, PostGIS, Redis), Alembic with a first migration enabling `postgis`, `pg_trgm` and `btree_gist`, ruff, mypy and pytest, Dockerfile.
- `docker-compose.yml` (PostGIS 17-3.7, Redis 7.4), GitHub Actions CI (web, API with service containers, secret scan), local development guide.

### Removed
- Leftover prototype file `public/js/data.js`.

### Added (Stage 0)
- Stage 0 documentation: reference analysis, provider and data-source research, PRD, MVP scope, roadmap, backlog, implementation plan, architecture, database ERD, schema and data dictionary, API draft, testing strategy, ADRs 0001–0013.
- MIT licence.

### Changed
- Planning updated for the owner's decisions: non-commercial, zero budget, open data only, weekly data-check job.
