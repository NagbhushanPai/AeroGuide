"""Redis client factory. Redis holds only small shared caches (see ADR-0012)."""

from redis.asyncio import Redis


def create_redis(redis_url: str) -> "Redis":
    return Redis.from_url(redis_url, decode_responses=True, socket_timeout=5)
