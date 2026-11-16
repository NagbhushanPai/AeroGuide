# ADR-0013: Weekly data check job

- Status: Accepted (as implemented below)
- Date: 2026-11-13

## Context
Airport, lounge and card facts go stale, and community data APIs change without notice. The owner has decided on a **weekly cron job that checks the data**. With a zero budget, it has to run on free infrastructure.

## Decision
A GitHub Actions workflow, `.github/workflows/weekly-data-check.yml`:

- **Schedule:** `cron: "0 3 * * 1"`, every Monday at 03:00 UTC (08:30 IST), plus `workflow_dispatch` for manual runs.
- **Runs** `python -m app.jobs.data_check` from `apps/api`, against the production database through a **read-only** role (secret `DATABASE_URL_READONLY`).

| Check | What it does | Flags |
|---|---|---|
| Staleness | Finds records whose `verified_at + reverify_after_days` has passed, plus all `unverified` and `unavailable` records | "Due for re-verification" |
| Source links | Requests every `sources.url` (polite rate, custom User-Agent, honours robots.txt). Records the HTTP status, final URL and a content hash | Broken links, redirects, **changed content** (hash differs from the last check) |
| Seed validation | Runs the seed loader in `--check` mode on the YAML content | Schema or provenance violations |
| Open data providers | One small request each to adsb.lol, OpenSky and adsbdb, validating the response shape | Upstream API changes or outages |
| Database activity | The job's queries count as activity | Helps keep the free Supabase project from pausing |

**Output:**
- A GitHub job summary.
- **One issue per run**, labelled `data-check` and titled "Weekly data check — YYYY-MM-DD", with a checklist of records to re-verify and sources that changed. The previous open data-check issue is updated rather than duplicated.

**The job never edits data.** It doesn't change `verification_status` or any fact. A person re-checks the source and updates the YAML through a PR ([ADR-0007](./0007-content-as-reviewed-seed-files.md)).

Content hashes and last-check results are stored in a small `source_checks` table, written by a separate least-privilege role used only by this job. That table is the job's only write.

## Implementation note (2026-11-13, Stage 3)

The first version reads the **YAML seed files** (the reviewed source of truth, [ADR-0007](./0007-content-as-reviewed-seed-files.md)) instead of the production database, so it works before a database exists and needs no database secret:

- Staleness and the review queue are computed from the YAML. The 116 OurAirports rows are reported as a count, not listed: they are always `unverified` because their source is secondary.
- Last week's content hashes are stored in a hidden comment at the end of the issue body and read back the next week. `source_checks` exists in the schema for a later database-backed version.
- Sources whose `robots.txt` disallows automated access are not fetched. They're listed as "check by hand".
- Code: `apps/api/app/jobs/data_check.py`. Workflow: `.github/workflows/weekly-data-check.yml`. Run locally with `pnpm data-check`.

The database keep-alive concern is unchanged. The `deploy-data.yml` runs and normal API traffic count as activity.

## Update (2026-11-16)

- The keep-alive question is settled: `.github/workflows/keep-alive.yml` runs `python -m app.jobs.ping_db` (one read-only query) on Mondays and Thursdays at 04:17 UTC, so the database never goes a week without activity.
- The provider check also covers adsb.fi, now part of the position pool ([ADR-0004](./0004-flight-provider-abstraction.md)).
- Still YAML-based: no `DATABASE_URL_READONLY` role and no writes to `source_checks`.

## Consequences
- $0 cost. Staleness is visible every week without a person having to remember to check.
- Source pages that change cosmetically will cause false positives. The hash is computed over extracted main text, not raw HTML, to reduce noise.
- **Risk:** Supabase pauses after 1 week without database activity. A weekly job alone sits right at that limit. Normal site traffic usually covers it. If not, add a twice-weekly keep-alive step (open question for the owner). Resolved 2026-11-16: see the update above.
