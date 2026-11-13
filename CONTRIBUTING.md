# Contributing to AeroGuide

## Ground rules

1. **Never invent data.** Live positions, schedules, terminal assignments, lounge hours, facilities and card benefits must come from a cited source, or be marked `unverified` or `unavailable`.
2. **Never commit secrets.** Use `.env` files (git-ignored) and the platform secret stores.
3. **Keep the app runnable** after every change.
4. **Open data and free tiers only.** AeroGuide is non-commercial with a zero budget. Don't add paid services or proprietary data sources.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope):`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`, `refactor:`. Scopes include `web`, `api`, `flights`, `airports`, `lounges`, `cards`, `db`.

## Pull requests

- One logical change per PR, with a description of what changed and how it was tested.
- CI must be green (lint, types, tests, seed validation).
- Update the relevant docs in `docs/` and add an ADR if a decision changes.

## Content contributions (airports, lounges, cards)

Content is edited as YAML seed files ([ADR-0007](docs/decisions/0007-content-as-reviewed-seed-files.md)). Each change must include:

- the **source URL** (an official airport, AAI, airline, bank, lounge operator or programme page),
- the date you checked it,
- `verification_status: verified` only if the fact came from that official source.

For card policy changes, **add a new policy version** with `valid_from`. Never edit an existing one.

The weekly `data-check` issue lists records due for re-verification and sources whose content changed. These are a good place to start.

## Local development

Instructions arrive in Stage 1 (`docs/deployment/local-development.md`).
