# ADR-0006: Content provenance and verification

- Status: Proposed
- Date: 2026-11-13

## Context
Terminal assignments, lounge hours, lounge acceptance and card benefits change often. The brief forbids inventing any of them and requires source and verification metadata.

## Decision
1. A `sources` table: `id`, `name`, `url`, `publisher`, `source_type` (official_airport, aai, airline, bank, lounge_operator, network_program, licensed_provider, secondary), `retrieved_at`, `archived_url`, `content_hash`.
2. A `Provenance` mixin on every mutable fact-bearing table:
   - `verification_status` enum: `verified`, `unverified`, `unavailable`
   - `verified_at` (date), `verified_by` (text), `reverify_after_days` (int), `primary_source_id` (FK) and `notes`
   - plus `record_sources` (polymorphic many-to-many) for extra citations.
3. **A `verified` record must have a primary source of an official or licensed type and a `verified_at`.** This is enforced by a check constraint and the seed validator.
4. `outdated` is **computed** (`verified_at + reverify_after_days < today`) and exposed by the API as a fourth display status. It is not stored, so it can't drift.
5. The UI shows status and date next to every such record. Missing data is shown as "Not yet verified", never hidden behind an assumed default.

## Consequences
Data entry is slower and costs more, and that's intended. Every claim can be audited. A staleness report (CLI and CI warning) shows what needs re-checking.
