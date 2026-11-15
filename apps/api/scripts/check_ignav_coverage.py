"""Which Indian airlines does Ignav return? One request per route, three routes by default.

    cd apps/api
    uv run python scripts/check_ignav_coverage.py            # shows the plan, sends nothing
    uv run python scripts/check_ignav_coverage.py --yes      # sends 3 billable requests

COSTS REAL REQUESTS: each route is one billable Ignav fare search (the free allowance is 1,000,
once). Run it rarely: when checking coverage before a launch, or after Ignav announces changes.
Retries are off and a hard cap equal to the number of routes stops anything extra.

The default routes cover three regions: DEL-BOM (north-west trunk), BLR-HYD (south) and
CCU-GAU (east and north-east). It reports whether IndiGo, Air India Express, Akasa Air and
SpiceJet appear, and the currency the Indian market returns. Not part of the app runtime; these
requests aren't counted by the app's own budget, which is why the app's cap (900) leaves room.
"""

import argparse
import asyncio
import contextlib
import json
import sys
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.india import today_ist
from app.fares.budget import BudgetGuard, BudgetPolicy, InMemoryUsageLedger
from app.providers.fares.base import ProviderError
from app.providers.fares.ignav import IgnavProvider
from app.schemas.fares import FareQuery

DEFAULT_ROUTES = ("DEL-BOM", "BLR-HYD", "CCU-GAU")
WATCH = {"6E": "IndiGo", "IX": "Air India Express", "QP": "Akasa Air", "SG": "SpiceJet"}


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--yes", action="store_true", help="actually send the requests")
    ap.add_argument("--routes", default=",".join(DEFAULT_ROUTES), help="comma-separated, A-B")
    ap.add_argument("--days-ahead", type=int, default=21, help="departure date offset (IST)")
    ap.add_argument("--save", type=Path, help="write each raw response as JSON in this folder")
    return ap.parse_args()


async def main() -> int:
    args = parse_args()
    routes = [r.strip().upper() for r in args.routes.split(",") if r.strip()]
    for r in routes:
        if len(r) != 7 or r[3] != "-" or not (r[:3].isalpha() and r[4:].isalpha()):
            print(f"bad route {r!r}: use A-B with IATA codes, e.g. DEL-BOM")
            return 2
    day = today_ist() + timedelta(days=args.days_ahead)
    print(f"Plan: {len(routes)} one-way searches on {day} (market IN, 1 adult, economy).")
    print(f"This uses {len(routes)} billable Ignav requests: {', '.join(routes)}.")
    settings = get_settings()
    if settings.ignav_api_key is None:
        print("IGNAV_API_KEY is not set (apps/api/.env). Nothing sent.")
        return 2
    if not args.yes:
        print("Dry run: nothing sent. Add --yes to send them.")
        return 0

    raw: dict[str, Any] = {}
    sent = 0

    async def capture(response: httpx.Response) -> None:
        nonlocal sent
        sent += 1
        await response.aread()
        with contextlib.suppress(ValueError):
            raw[response.request.url.path + f"#{sent}"] = response.json()

    # Hard cap: exactly one request per route, no retries.
    budget = BudgetGuard(InMemoryUsageLedger(), BudgetPolicy(total_cap=len(routes)))
    async with httpx.AsyncClient(event_hooks={"response": [capture]}) as client:
        provider = IgnavProvider(
            client,
            settings.ignav_api_key.get_secret_value(),
            budget,
            market=settings.ignav_market,
            base_url=settings.ignav_base_url,
            timeout_s=45.0,
            max_retries=0,
        )
        for route in routes:
            origin, destination = route.split("-")
            query = FareQuery(origin=origin, destination=destination, departure_date=day)
            try:
                offers = await provider.search(query)
            except ProviderError as exc:
                print(f"\n{route}: failed ({exc.code}): {exc.message}")
                continue
            carriers: dict[str, str] = {}
            for o in offers:
                for leg in (o.outbound, o.inbound):
                    for s in leg.segments if leg else []:
                        if s.carrier_code:
                            carriers.setdefault(s.carrier_code, s.carrier_name or s.carrier_code)
            currencies = sorted({o.currency for o in offers})
            print(f"\n{route}: {len(offers)} offers, currency {', '.join(currencies) or 'n/a'}")
            print(
                "  airlines: "
                + (", ".join(f"{n} ({c})" for c, n in sorted(carriers.items())) or "none")
            )
            for code, name in WATCH.items():
                print(f"  {'yes' if code in carriers else 'no '}  {name}")
            if args.save:
                args.save.mkdir(parents=True, exist_ok=True)
                key = next(reversed(raw), None)
                if key is not None:
                    out = args.save / f"one_way_{origin.lower()}_{destination.lower()}.json"
                    out.write_text(json.dumps(raw[key], indent=2), encoding="utf-8")
    print(f"\nRequests sent: {sent} (billable only if they returned 200).")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
