# Lounge data sources

Researched 2026-11-13.

## Key distinction

| Concept | Question it answers | Authority |
|---|---|---|
| **Lounge acceptance** | "Does lounge L accept access method M?" (Priority Pass, a card network programme, airline status, paid walk-in) | Lounge operator and access-programme directory |
| **Card entitlement** | "Does my card give me complimentary access through method M, and under what conditions?" | Card issuer's terms (see [credit-card policy sources](./credit-card-policy-sources.md)) |

A user is eligible for **complimentary** entry only if *both* hold: the lounge accepts the method, and the card entitles the user to it right now (quota left, spend condition met, policy in force on the travel date). The UI must never show "accepted" as "free for you".

## Sources

| Data | Primary source | Notes |
|---|---|---|
| Lounge existence, terminal, airside/landside, location | Airport operator site; lounge operator site | Location text such as "near gate 42, level 3" must be quoted from the source |
| Opening hours | Lounge operator site | Many are 24h, but **store only what the source states** |
| Amenities, food and beverage | Lounge operator site | Store as tags (wifi, showers, bar, hot food, quiet zone, accessible). Leave a tag unset if not stated, rather than false |
| Paid walk-in price | Lounge operator or airport site | Store currency, amount, duration and `verified_at`. Prices change |
| Access programmes accepted | Programme directories (Priority Pass, DreamFolks, Visa and Mastercard lounge programmes, RuPay programme, airline lounge pages) | The programme's own lounge finder is the authority for "accepted" |

Common operators and programmes in India to research (confirm current relationships, which change): Encalm, TFS (Travel Food Services), Plaza Premium, airline lounges (for example the Air India Maharaja lounge), and the programmes Priority Pass, DreamFolks, Visa, Mastercard and RuPay.

## Limitations

- Programme acceptance changes.It is an example of why `valid_from` and `valid_to` are needed on acceptance records.
- There is no open API for lounge data. Curation is manual.
- Hours and prices must show their verification date in the UI, with a "may have changed" notice after the re-verify interval (60 days by default).
