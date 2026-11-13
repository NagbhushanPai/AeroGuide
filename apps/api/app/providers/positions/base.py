"""Position provider interface (ADR-0004)."""

from typing import Protocol

from app.schemas.positions import AircraftState


class PositionProvider(Protocol):
    name: str
    url: str
    attribution: str
    is_demo: bool

    async def fetch(self) -> list[AircraftState]:
        """Latest aircraft over the India coverage area. Raises on failure (never returns
        an empty list to hide an outage)."""
        ...


class ProviderRateLimitedError(Exception):
    """The source asked us to slow down. The live service rests it for `retry_after_s`."""

    def __init__(self, provider: str, retry_after_s: float) -> None:
        super().__init__(f"{provider} rate-limited us; retry after {retry_after_s:.0f}s")
        self.retry_after_s = retry_after_s


# Coverage area used by every provider: India and its approaches.
INDIA_BBOX = {"lamin": 6.0, "lamax": 37.5, "lomin": 67.0, "lomax": 98.0}


def in_coverage(lat: float, lon: float) -> bool:
    return (
        INDIA_BBOX["lamin"] <= lat <= INDIA_BBOX["lamax"]
        and INDIA_BBOX["lomin"] <= lon <= INDIA_BBOX["lomax"]
    )
