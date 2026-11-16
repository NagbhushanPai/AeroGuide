# Credit-card lounge policy sources

Researched 2026-11-13.

## Authoritative sources

1. **The issuing bank's official card page and most-important-terms-and-conditions (MITC) PDF.** The only acceptable source for a `verified` policy.
2. **The bank's official announcements or emails about benefit changes.** These give effective dates.
3. **Network programme pages** (Visa, Mastercard, RuPay, Diners). Authority for programme rules such as entry method, but not for a specific card's quota.
4. Third-party trackers, blogs and forums. **Leads only.** A policy sourced only from these is stored as `unverified` and shown with a warning.

## What a policy needs to capture

From reviewing how issuers phrase benefits (a third-party tracker was used as a format reference only). The right-hand column names the rule type as built in `app/eligibility/rules.py`:

| Field            | Example shapes seen                                                            | Model                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Visit quota      | "2 per quarter", "8 per year", "unlimited", "1 per month"                      | `visit_quota` rule (count or unlimited, period)                                                                   |
| Scope            | domestic, international, both, specific airports                               | `scope` on the policy, plus an `airport_restriction` rule                                                         |
| Spend gate       | "spend ₹50,000 in the previous calendar quarter to unlock visits this quarter" | `spend_gate` rule (amount, currency, window)                                                                      |
| Unlock mechanics | voucher on milestone, app-generated pass, swipe at lounge (₹2 auth)            | `entry_method` rule; the ₹2 authorisation is an informational `fee` rule that never changes an answer             |
| Programme        | Priority Pass, network programme, bank-specific                                | `program_entitlement` rule (FK to `access_programs`)                                                              |
| Guests           | "1 complimentary guest", "guest visits count against quota"                    | `guest_allowance` rule                                                                                            |
| Add-on cards     | shared or separate quota                                                       | `add_on_cardholders` rule (informational)                                                                         |
| Effective dates  | "from 1 April"                                                                 | `valid_from` and `valid_to` on the policy **version**                                                             |
| Variant          | metal, world, signature, etc.                                                  | `card_variants`                                                                                                   |
| Anything else    | conditions no rule type captures                                               | quoted in `unmodelled_terms`, which makes the answer "depends"                                                    |

## Policy versioning requirements

- A policy change never overwrites. It **closes** the current version (`valid_to`) and inserts a new one.
- Eligibility is evaluated against the version **in force on the travel date**, not today's.
- Every version links to at least one `source` with URL, retrieval date and (where possible) an archived copy (Wayback URL or stored PDF hash).

## Limitations and risks

- **Rules change roughly quarterly**, often with short notice. Without a re-verification process the data goes stale fast. That process is a staffing and ops decision.
- MITC documents are often ambiguous about spend-window semantics (calendar quarter vs statement cycle). If a rule is ambiguous, **store it as ambiguous** (`ambiguous: true`) and have the engine answer "depends" with a reason, never a guess ([ADR-0009](../decisions/0009-deterministic-eligibility-engine.md)).
- **Privacy:** the checker asks only for card _product_ (bank, card, variant), travel date, domestic/international and optionally self-reported spend and visits used. **No card numbers, CVV, PIN, OTP or banking credentials, ever.**
