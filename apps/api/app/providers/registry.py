"""Build providers from settings (ADR-0004). Swapping sources is a config change."""

import logging
from collections.abc import Callable

import httpx

from app.fares.budget import BudgetGuard
from app.providers.fares.base import FlightProvider
from app.providers.fares.ignav import IgnavProvider
from app.providers.fares.mock import MockProvider
from app.providers.flight_info.adsbdb import AdsbdbRoutes
from app.providers.positions.adsblol import (
    AdsbFiProvider,
    AdsbLolProvider,
    ReadsbGridProvider,
    ReadsbPool,
)
from app.providers.positions.base import PositionProvider
from app.providers.positions.demo import DemoProvider
from app.providers.positions.opensky import OpenSkyProvider

POSITION_PROVIDERS = ("adsblol", "adsbfi", "opensky", "demo")
READSB = ("adsblol", "adsbfi")  # same JSON format: pooled when both are configured
FARE_PROVIDERS = ("ignav", "mock")

logger = logging.getLogger(__name__)


def build_position_providers(
    names: list[str],
    client: httpx.AsyncClient,
    opensky_client_id: str | None = None,
    opensky_client_secret: str | None = None,
) -> list[PositionProvider]:
    unknown = set(names) - set(POSITION_PROVIDERS)
    if unknown:
        raise ValueError(f"unknown position providers: {sorted(unknown)}")
    # ADR-0011: demo is never mixed into a real failover chain.
    if "demo" in names and len(names) > 1:
        raise ValueError(
            "the demo provider must be configured on its own (POSITION_PROVIDERS=demo)"
        )
    # adsb.lol and adsb.fi share one format: when both are listed they work as one pool with
    # point-by-point failover, placed where the first of them is listed.
    readsb_names = [n for n in names if n in READSB]
    if len(readsb_names) > 1:
        networks: list[ReadsbGridProvider] = [
            AdsbLolProvider(client) if n == "adsblol" else AdsbFiProvider(client)
            for n in readsb_names
        ]
        pool = ReadsbPool(networks)
        providers: list[PositionProvider] = []
        for n in names:
            if n == readsb_names[0]:
                providers.append(pool)
            elif n not in READSB:
                providers.append(_one(n, client, opensky_client_id, opensky_client_secret))
        return providers
    return [_one(n, client, opensky_client_id, opensky_client_secret) for n in names]


def _one(
    name: str,
    client: httpx.AsyncClient,
    opensky_client_id: str | None,
    opensky_client_secret: str | None,
) -> PositionProvider:
    factories: dict[str, Callable[[], PositionProvider]] = {
        "adsblol": lambda: AdsbLolProvider(client),
        "adsbfi": lambda: AdsbFiProvider(client),
        "opensky": lambda: OpenSkyProvider(client, opensky_client_id, opensky_client_secret),
        "demo": DemoProvider,
    }
    return factories[name]()


def build_route_lookup(enabled: bool, client: httpx.AsyncClient) -> AdsbdbRoutes | None:
    return AdsbdbRoutes(client) if enabled else None


def build_fare_providers(
    names: list[str],
    client: httpx.AsyncClient,
    budget: BudgetGuard,
    *,
    ignav_api_key: str | None,
    ignav_base_url: str,
    ignav_market: str,
    ignav_timeout_s: float,
    ignav_max_retries: int,
    ignav_min_interval_s: float,
    ignav_max_concurrent: int,
) -> list[FlightProvider]:
    """Fare providers (ADR-0015). A paid provider without a key is left out with a warning, so
    the site runs without fare search rather than failing to start."""
    unknown = set(names) - set(FARE_PROVIDERS)
    if unknown:
        raise ValueError(f"unknown fare providers: {sorted(unknown)}")
    if "mock" in names and len(names) > 1:
        raise ValueError(
            "the mock fare provider must be configured on its own (FARE_PROVIDERS=mock)"
        )
    providers: list[FlightProvider] = []
    for name in names:
        if name == "mock":
            providers.append(MockProvider())
        elif name == "ignav":
            if not ignav_api_key:
                logger.warning("IGNAV_API_KEY is not set: fare search is off")
                continue
            providers.append(
                IgnavProvider(
                    client,
                    ignav_api_key,
                    budget,
                    market=ignav_market,
                    base_url=ignav_base_url,
                    timeout_s=ignav_timeout_s,
                    max_retries=ignav_max_retries,
                    min_interval_s=ignav_min_interval_s,
                    max_concurrent=ignav_max_concurrent,
                )
            )
    return providers
