# ADR-0009: Deterministic, versioned eligibility engine

- Status: Proposed
- Date: 2026-11-13

## Context
Card lounge benefits have quotas, spend gates over various windows, scope (domestic or international), programmes and guest rules. They change over time. Users ask "can I get into lounge L on date D with card C?". The answer must be explainable and reproducible, and computed in the backend.

## Decision
1. **Data:** `lounge_policies` rows are immutable versions (`valid_from`, `valid_to`, `superseded_by_id`) per card variant and scope. Rules are stored as typed JSON in `policy_rules.rule` and validated by a **Pydantic discriminated union**: `visit_quota`, `spend_gate`, `guest_allowance`, `program_entitlement`, `airport_restriction`, `entry_method`.
2. **Engine:** a pure function `evaluate(request, policy_version, lounge_acceptances, today) -> EligibilityResult`. No I/O, no clock reads (the date is passed in), no randomness.
3. **Two-sided check:** eligible only if (a) the policy in force on the travel date entitles the card to programme P for the scope, **and** (b) the lounge accepts P on that date (versioned `lounge_access_methods`).
4. **Result:** `status` ∈ {`eligible`, `conditional`, `not_eligible`, `unknown`}, plus `reasons[]` (machine code + human text), `requirements[]` (for example "spend ₹X in previous quarter"), `policy_version_id`, `sources[]` and `evaluated_at`.
   - `conditional`: depends on inputs the user didn't give (spend, visits used).
   - `unknown`: no policy in force, an ambiguous rule, or unverified data. **Never** reported as eligible.
5. **Inputs exclude any sensitive card data.** Product identifiers and optional self-reported numbers only.

## Implementation note (2026-11-14, Stage 5a)

Implemented in `apps/api/app/eligibility/` (`rules.py`, `engine.py`). Differences from the proposal above:

- **Three outcomes:** `yes`, `no` and `depends`. "Unknown" and "conditional" are both `depends`, each with the check that caused it. No policy in force was a plain `no` ("no benefit recorded"); see the revision below. The UI labels `yes` as "Likely yes", because the bank and the lounge decide at the door.
- **No card variants:** a variant with different benefits is its own card (own slug).
- **Versions** are linked by date (`valid_from`/`valid_to`, exclusive end), not by `superseded_by_id`. Exclusion constraints stop overlaps per (card, scope) and per (lounge, programme).
- **Rule fields:** every rule has `ambiguous` (it can never yield a plain yes) and `note`. A policy can quote `unmodelled_terms`, which make every answer `depends`.
- **Tests:** table-driven tests for every rule type, and Hypothesis property tests: more spend never makes the answer worse, more visits used never makes it better, a policy outside its window never applies, an ambiguous rule never gives a plain yes, and every non-yes answer names its reason.
- **API:** `POST /api/v1/eligibility` takes card slugs, an airport, a date, the flight scope, guests and optional per-card facts. It evaluates every listed lounge at that airport. Unknown fields are rejected, the response is `no-store`, and nothing is persisted or logged.

## Revision (2026-11-14): missing data is never "no"

The launch data showed the engine could almost never say "yes", and sometimes said "no" when it simply lacked a record. Changes (migration 0006):

- **No recorded benefit is `depends`**, with "that doesn't mean there isn't one". Only a benefit that ended (a version with `valid_to` and nothing after it) is `no`. This replaces "no policy in force is a plain `no`" above.
- **Guests:** when the traveller brings guests and the policy has no guest rule, the answer is `depends` ("the terms don't say"). A stated guest fee answers it.
- **Informational rule types** `fee` and `add_on_cardholders`, like `entry_method`, add notes and never change the answer. Fees and add-on rules no longer need `unmodelled_terms`. A property test checks they never change the status.
- **Lounge direction:** lounges are `departures`, `arrivals` or `transit`. Only departure lounges are evaluated.
- **Output:** a `no` returns only its deciding checks. Programme keys are shown by name. Quoted bank wording moves from the message to a separate `detail`, so the UI can fold it away.

## Consequences
The engine is easy to test exhaustively (table-driven and property-based). Each new rule shape needs a model, engine support, tests and docs. Ambiguity is visible to users instead of hidden.
