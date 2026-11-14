# Card launch set (research checklist)

Researched 2026-11-14. **This is a to-do list for contributors, not data.** Nothing here appears on the site until it's in a card file with a source and a check date ([CONTRIBUTING.md](../../CONTRIBUTING.md#adding-lounges-and-cards)).

## Scope (owner decision, 2026-11-14)

The **top 3 travel cards** of the **5 largest issuers**.

## The five issuers

Ranked by credit cards outstanding. Confirm the current order in the RBI's monthly [Bankwise ATM/POS/Card Statistics](https://rbi.org.in/Scripts/ATMView.aspx) before starting. The order changes slowly, but it does change.

| Issuer | Seed slug | Official site (checked 2026-11-14) |
|---|---|---|
| HDFC Bank | `hdfc-bank` | https://www.hdfc.bank.in/ |
| SBI Card | `sbi-card` | https://www.sbicard.com/ |
| ICICI Bank | `icici-bank` | https://www.icici.bank.in/ |
| Axis Bank | `axis-bank` | https://www.axis.bank.in/ |
| Kotak Mahindra Bank | `kotak-mahindra-bank` | https://www.kotak.bank.in/ |

## Choosing the 3 cards per issuer

"Travel card" means a card the bank itself markets with lounge access as a headline benefit. To pick fairly and reproducibly:

1. On the bank's own credit-card listing page, filter or browse to travel (or premium) cards.
2. Keep the cards that list lounge access in their benefits.
3. Take the 3 the bank lists first, or features most. Record the listing page URL and date in the PR, so a reviewer can see why those 3 were chosen.

Don't pick from news articles, comparison sites or memory. They go out of date quickly and may be paid placements.

## For each card, record

- [ ] The product page (`product_url`) and the most important terms document (MITC) or lounge-programme page, each added to `sources.yaml`
- [ ] The network (`visa`, `mastercard`, `rupay`, `amex` or `diners`)
- [ ] Domestic benefit: programme, visits and period, spend requirement and its window, guests, how to enter, and the date it applies from
- [ ] International benefit: the same fields
- [ ] Any condition no rule type captures, quoted in `unmodelled_terms`
- [ ] Wording that can be read two ways, marked `ambiguous: true`

## For the lounges

Each card's programme needs lounges that accept it. Start with the 7 guide airports (DEL, BOM, BLR, HYD, MAA, COK, JAI), using each lounge operator's or programme's own page.

## Progress

Done 2026-11-14. Every policy cites the bank's own page or terms PDF (see the card files).

| Issuer | Card 1 | Card 2 | Card 3 | Why these 3 |
|---|---|---|---|---|
| HDFC Bank | Infinia Metal | Diners Club Black Metal | Regalia Gold | The first three cards with lounge benefits on the [listing](https://www.hdfc.bank.in/credit-cards) |
| SBI Card | ELITE | PRIME | MILES ELITE | SBI's premium and travel cards with lounge terms the bank publishes |
| ICICI Bank | Emeralde | Sapphiro | Rubyx | Featured on the [listing](https://www.icici.bank.in/personal-banking/cards/credit-card); 1838 Reserve has no lounge access |
| Axis Bank | Atlas | Magnus | Horizon | Axis's travel cards on the [listing](https://www.axis.bank.in/cards/credit-card) |
| Kotak Mahindra Bank | White Reserve | Solitaire | Air+ | The premium unlimited-lounge cards, plus the featured travel card on the [listing](https://www.kotak.bank.in/en/personal-banking/cards/credit-cards.html) |

### Beyond the launch set

61 more cards from 17 issuers were imported on 2026-11-14 from a third-party lounge tracker, all marked unverified (see CONTRIBUTING, "Imported cards waiting for a check"). Checking them against each bank's own page is the next content task.

### Known gaps

- **Networks:** the banks don't state one for Regalia Gold, SBI's three cards, Atlas or Kotak's three cards, so these show "not stated".
- **Undated brochures:** SBI's ELITE and PRIME counts come from undated brochures. Those rules are marked ambiguous.
- **No lounge lists:** HDFC's (JavaScript only), ICICI's and Kotak's lists of lounges for their own programmes aren't linked to lounges yet. For those programmes, the checker finds no lounges.
- **Atlas:** the bank says its international programme is "under maintenance".
