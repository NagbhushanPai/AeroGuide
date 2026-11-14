"""Build providers from settings (ADR-0004). Swapping sources is a config change."""

from collections.abc import Callable

import httpx

from app.providers.flight_info.adsbdb import AdsbdbRoutes
from app.providers.positions.adsblol import AdsbFiProvider, AdsbLolProvider
from app.providers.positions.base import PositionProvider
from app.providers.positions.demo import DemoProvider
from app.providers.positions.opensky import OpenSkyProvider

POSITION_PROVIDERS = ("adsblol", "adsbfi", "opensky", "demo")


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
    factories: dict[str, Callable[[], PositionProvider]] = {
        "adsblol": lambda: AdsbLolProvider(client),
        "adsbfi": lambda: AdsbFiProvider(client),
        "opensky": lambda: OpenSkyProvider(client, opensky_client_id, opensky_client_secret),
        "demo": DemoProvider,
    }
    return [factories[n]() for n in names]


def build_route_lookup(enabled: bool, client: httpx.AsyncClient) -> AdsbdbRoutes | None:
    return AdsbdbRoutes(client) if enabled else None
