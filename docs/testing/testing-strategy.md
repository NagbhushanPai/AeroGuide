# Testing strategy

Last updated: 2026-11-13. Status: planned (no tests yet; tooling arrives in Stage 1).

## Layers

| Layer | Tool | Scope | Runs in |
|---|---|---|---|
| API unit | pytest | Services, the eligibility engine, provider adapters (with recorded fixtures), schema validation | CI on every PR |
| API integration | pytest + real Postgres+PostGIS and Redis (Docker / CI service containers) | Repositories, migrations, endpoints through `httpx.AsyncClient`, geo queries | CI on every PR |
| Migrations | Alembic upgrade → downgrade → upgrade on an empty DB | Every migration is reversible | CI |
| Seed validation | Custom loader in `--check` mode | Every record has provenance. FKs resolve. No `verified` record without a source URL and date | CI. Fails the build |
| Web unit and component | Vitest + Testing Library | Formatting helpers, components, state handling (loading, error, empty, demo, stale) | CI |
| Contract | OpenAPI schema → generated TS types. The type check fails on drift | Frontend and API agree on shapes | CI |
| E2E | Playwright | Smoke test per route. Live map in demo mode. Eligibility checker flows. Mobile viewport | CI (against compose stack) |
| Accessibility | axe via Playwright | Every route has no serious or critical violations | CI |
| Performance | Lighthouse CI | Content pages and live map budgets from the PRD | CI (warn), pre-release (gate) |

## Eligibility engine: the highest-risk logic

- **Table-driven tests:** one row per rule shape (quota per period, spend gate per window, guest rules, scope, policy-version boundaries).
- **Property-based tests (Hypothesis):**
  - The result is deterministic for the same inputs.
  - A travel date before a policy's `valid_from` never uses that policy.
  - Missing required inputs yield `unknown`, never `eligible`.
  - A lounge that doesn't accept the programme is never `eligible`.
- **Golden tests:** real sourced policies (once seeded) with expected outcomes, reviewed by a person.

## Data honesty tests

- Demo mode: every aircraft feature carries `is_demo=true`. The UI shows the DEMO DATA badge whenever any demo feature is present (component and e2e tests).
- Stale data: given positions older than the thresholds, the UI fades or hides them as specified.
- Missing fields render "Not available", never empty strings or zeros.

## Provider adapters

- Recorded HTTP fixtures (respx). No live calls in CI.
- An optional nightly live smoke job (manual dispatch) with secrets, to detect upstream API changes.
