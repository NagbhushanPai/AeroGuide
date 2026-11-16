# Card files

One file per card: `{bank-slug}--{card-slug}.yaml`. See CONTRIBUTING.md, "Adding lounges and
cards". Policies are versioned: when a bank changes a benefit, end the old version with
`valid_to` and add a new one. Never edit a past version's rules. A variant with different
benefits (for example a metal edition) is its own file. Rule types: `program_entitlement`,
`visit_quota`, `spend_gate`, `guest_allowance`, `airport_restriction`, `entry_method`, and the
informational `fee` and `add_on_cardholders` (`app/eligibility/rules.py`).
