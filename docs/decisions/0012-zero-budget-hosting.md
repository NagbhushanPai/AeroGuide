# ADR-0012: Zero-budget hosting and on-demand ingestion

- Status: Proposed
- Date: 2026-11-13

## Context
The owner has decided AeroGuide is **non-commercial with a zero budget**. The mandated platforms all have free tiers, but with limits that shape the architecture. Researched 2026-11-13. Re-check on each provider's pricing page before deploying:

| Platform | Free-tier limits that matter |
|---|---|
| Vercel Hobby | Free, for personal and non-commercial use |
| Render free web service | **Sleeps after 15 min without traffic**, about 1 min cold start, 750 instance-hours a month per workspace. No free always-on background worker |
| Supabase free | 500 MB database per project, 2 projects. **Pauses after 1 week without database activity** |
| Upstash Redis free | **500K commands a month**, about 256 MB, 10 GB bandwidth. One free database |
| GitHub Actions | Free for public repositories |
| OpenFreeMap tiles | Free, no key |

## Decision
1. **No always-on worker.** Live positions are fetched **on demand** inside the API process. When a request arrives and the in-memory snapshot is older than **60 s**, one background sweep starts (a single lock guarantees only one) while the existing snapshot is served immediately (stale-while-revalidate). Only a request with no snapshot at all waits. With no viewers, no upstream calls are made.
   - **Why 60 s:** adsb.lol allows **10 requests per rolling minute** (observed 2026-11-13: the 11th request in a minute gets `429` with `Retry-After`). One sweep is exactly 10 point queries, 1 s apart, so it fits once a minute.
   - **Rate limits are honoured:** a `429` aborts the sweep (partial coverage would silently hide regions), the source rests for `Retry-After` (default 2 min for adsb.lol, 1 h for OpenSky), and the next source is used meanwhile.
   - Because sweeps run once a minute, positions are normally 0-70 s old, so the **"live" threshold is 90 s** (was 60 s).
2. **In-memory first, Redis sparingly.** The latest snapshot and rate-limit counters live in process memory (a single instance). Redis (Upstash) holds:
   - the snapshot, written **at most once every 60 s**, so a restarted instance can serve something at once,
   - the callsign → route cache (6 h),
   - the OpenSky airport-movements cache (24 h).

   Rough budget: ≤ 1,440 snapshot writes a day plus route lookups, which is well under 500K commands a month. **No card is added to Upstash**, so it can't upgrade to paid usage.
3. **No position history in Postgres** on the free tier (`POSITION_HISTORY_ENABLED=false`). 500 MB can't hold days of sampled positions. Short trails (about 15 min) come from an in-memory ring buffer. The `flight_positions` table stays in the schema for when storage allows.
4. **Content pages are static first.** Airport, lounge and card pages are statically generated with ISR on Vercel. If the API is asleep or down, visitors still get the last generated page.
5. **The live page handles cold starts.** It shows "Waking up the live data service…" while the API spins up, instead of an error.
6. **Scheduled jobs run on GitHub Actions** ([ADR-0013](./0013-weekly-data-check.md)), not on a paid worker.

## Exception
Fare search uses Ignav, a paid API, within a hard request budget that stays below its free allowance by default ([ADR-0015](./0015-paid-fare-search-with-a-request-budget.md)).

## Consequences
- AeroGuide runs at $0. The first live-map visitor after a quiet period waits about 1 minute.
- One API instance means in-memory state is consistent. Scaling out later would move the snapshot and rate limits to Redis, which is a config change in the repository layer.
- If free-tier terms change, the [deployment architecture](../architecture/deployment-architecture.md) and this ADR must be revisited.
