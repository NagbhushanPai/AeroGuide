"""Redis client factory. Redis holds only small shared caches (see ADR-0012)."""

from typing import cast

from redis.asyncio import Redis


def create_redis(redis_url: str) -> "Redis":
    return Redis.from_url(redis_url, decode_responses=True, socket_timeout=5)


class RedisKeyValue:
    """String get/set over Redis, the only operations the live service needs."""

    def __init__(self, redis: "Redis") -> None:
        self._redis = redis

    async def get(self, name: str) -> str | None:
        return cast(str | None, await self._redis.get(name))

    async def set(self, name: str, value: str, ex: int | None = None) -> object:
        return await self._redis.set(name, value, ex=ex)
