# ADR-0007: Content as reviewed seed files

- Status: Accepted
- Date: 2026-11-13

## Context
There's no admin CMS in the MVP, but airport, lounge and card data must be updatable without changing frontend components, and every change must be reviewable.

## Decision
Content lives as YAML files in `apps/api/data/` (for example `airports/DEL.yaml`, `lounges/*.yaml`, `cards/{bank}/*.yaml`, `sources.yaml`). Each file is validated by Pydantic models that mirror the DB schema, including provenance rules. `make seed` upserts idempotently into Postgres. Policy files add new versions and never mutate existing ones. Content changes go through PRs, with the source URL in the diff.

## Consequences
- Git history doubles as an audit log of content changes.
- Non-engineers need a simple contribution guide (CONTRIBUTING.md), or eventually a CMS (backlog, P2).
- The API reads only from the DB. The YAML files are an input, not a runtime dependency.

Note (2026-11-16): the layout settled differently from the examples above. `apps/api/data/` holds one `airports.yaml` (all airports), `airport_guides/{IATA}.yaml`, `lounges/{IATA}.yaml` (one file per airport), `cards/{bank-slug}--{card-slug}.yaml` (flat, no bank folders), `sources.yaml`, and reference lists (`airlines`, `banks`, `card_networks`, `access_programs`, `amenities`, `osm_terminals`). `make seed` / `pnpm seed` run `python -m app.seed`; `--check` validates without a database. On a push to `main` that touches the data, `deploy-data.yml` validates, migrates and seeds production. Policy versioning is as decided (see `data/cards/README.md`).
