# Credit-card lounge policy sources

Researched 2026-11-13.

## Authoritative sources

1. **The issuing bank's official card page and most-important-terms-and-conditions (MITC) PDF.** The only acceptable source for a `verified` policy.
2. **The bank's official announcements or emails about benefit changes.** These give effective dates.
3. **Network programme pages** (Visa, Mastercard, RuPay, Diners). Authority for programme rules such as entry method, but not for a specific card's quota.
4. Third-party trackers, blogs and forums. **Leads only.** A policy sourced only from these is stored as `unverified` and shown with a warning.

## What a policy needs to capture

From reviewing how issuers phrase benefits ( used as a format reference only):

| Field            | Example shapes seen                                                            | Model                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Visit quota      | "2 per quarter", "8 per year", "unlimited", "1 per month"                      | `quota {count or unlimited, period: month, quarter, year, lifetime}`                                              |
| Scope            | domestic, international, both, specific airports                               | `scope` enum and an optional airport list                                                                         |
| Spend gate       | "spend ₹50,000 in the previous calendar quarter to unlock visits this quarter" | `spend_condition {amount, currency, window: previous_quarter, current_quarter, rolling_days(n), statement_cycle}` |
| Unlock mechanics | voucher on milestone, app-generated pass, swipe at lounge (₹2 auth)            | `entry_method` enum and a free-text note                                                                          |
| Programme        | Priority Pass, network programme, bank-specific                                | FK to `access_programs`                                                                                           |
| Guests           | "1 complimentary guest", "guest visits count against quota"                    | `guest_rule`                                                                                                      |
| Add-on cards     | shared or separate quota                                                       | `addon_rule`                                                                                                      |
| Effective dates  | "from 1 April"                                                                 | `valid_from` and `valid_to` on the policy **version**                                                             |
| Variant          | metal, world, signature, etc.                                                  | `card_variants`                                                                                                   |

## Policy versioning requirements

- A policy change never overwrites. It **closes** the current version (`valid_to`) and inserts a new one.
- Eligibility is evaluated against the version **in force on the travel date**, not today's.
- Every version links to at least one `source` with URL, retrieval date and (where possible) an archived copy (Wayback URL or stored PDF hash).

## Limitations and risks

- **Rules change roughly quarterly**, often with short notice. Without a re-verification process the data goes stale fast. That process is a staffing and ops decision.
- MITC documents are often ambiguous about spend-window semantics (calendar quarter vs statement cycle). If a rule is ambiguous, **store it as ambiguous** and have the engine return `unknown` with a reason, never a guess.
- **Privacy:** the checker asks only for card _product_ (bank, card, variant), travel date, domestic/international and optionally self-reported spend and visits used. **No card numbers, CVV, PIN, OTP or banking credentials, ever.**
