"""Short-lived cache for fare search results (ADR-0015).

Redis when the app has it (REDIS_URL), otherwise in process memory. Values are JSON strings.
Only complete results are stored: the search service never caches an error or a result where
any provider failed.
"""

import logging
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Protocol, cast

from redis.asyncio import Redis

from app.schemas.fares import FareQuery

logger = logging.getLogger(__name__)

CACHE_VERSION = "v1"


def cache_key(
    pairs: list[tuple[str, str]], query: FareQuery, currency: str, providers: list[str]
) -> str:
    """origin + destination (every pair searched) + dates + passengers + cabin + currency."""
    routes = ",".join(f"{o}-{d}" for o, d in pairs)
    ret = query.return_date.isoformat() if query.return_date else "-"
    return ":".join(
        (
            "fares",
            CACHE_VERSION,
            routes,
            query.departure_date.isoformat(),
            ret,
            query.passengers.key(),
            query.cabin,
            currency,
            "+".join(sorted(providers)),
        )
    )


class FareCache(Protocol):
    async def get(self, key: str) -> str | None: ...
    async def set(self, key: str, value: str, ttl_s: int) -> None: ...


class InMemoryFareCache:
    """Per-process TTL cache with a size bound (oldest entries go first)."""

    def __init__(self, max_entries: int = 500, clock: Callable[[], float] = time.monotonic):
        self._data: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._max = max_entries
        self._clock = clock

    async def get(self, key: str) -> str | None:
        hit = self._data.get(key)
        if hit is None:
            return None
        if hit[0] <= self._clock():
            del self._data[key]
            return None
        return hit[1]

    async def set(self, key: str, value: str, ttl_s: int) -> None:
        self._data[key] = (self._clock() + ttl_s, value)
        self._data.move_to_end(key)
        while len(self._data) > self._max:
            self._data.popitem(last=False)


class RedisFareCache:
    """Cache failures are logged and treated as a miss: they never fail a search."""

    def __init__(self, redis: "Redis") -> None:
        self._redis = redis

    async def get(self, key: str) -> str | None:
        try:
            return cast(str | None, await self._redis.get(key))
        except Exception as exc:
            logger.warning("fare cache read failed: %s", type(exc).__name__)
            return None

    async def set(self, key: str, value: str, ttl_s: int) -> None:
        try:
            await self._redis.set(key, value, ex=ttl_s)
        except Exception as exc:
            logger.warning("fare cache write failed: %s", type(exc).__name__)
