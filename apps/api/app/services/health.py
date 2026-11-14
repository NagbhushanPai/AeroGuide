"""Dependency health checks. Framework-agnostic so it can be reused by jobs and tools."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.schemas.health import (
    ComponentHealth,
    HealthChecks,
    HealthResponse,
    LiveHealth,
    ProviderHealth,
)

logger = logging.getLogger(__name__)


class SupportsPing(Protocol):
    def ping(self) -> Awaitable[bool]: ...
    def info(self, section: str) -> Awaitable[dict[str, object]]: ...


async def _guarded(
    name: str, check: Callable[[], Awaitable[ComponentHealth]], timeout_s: float
) -> ComponentHealth:
    try:
        return await asyncio.wait_for(check(), timeout=timeout_s)
    except TimeoutError:
        return ComponentHealth(status="error", detail=f"timed out after {timeout_s:g}s")
    except Exception as exc:  # report any failure as a health state, never crash the endpoint
        logger.warning("health check %s failed: %s", name, exc)
        return ComponentHealth(status="error", detail=type(exc).__name__)


async def check_database(engine: AsyncEngine) -> ComponentHealth:
    async with engine.connect() as conn:
        version = (await conn.execute(text("SHOW server_version"))).scalar_one()
    return ComponentHealth(status="ok", version=str(version))


async def check_postgis(engine: AsyncEngine) -> ComponentHealth:
    async with engine.connect() as conn:
        version = (
            await conn.execute(
                text("SELECT extversion FROM pg_extension WHERE extname = 'postgis'")
            )
        ).scalar_one_or_none()
    if version is None:
        return ComponentHealth(status="error", detail="postgis extension not installed")
    return ComponentHealth(status="ok", version=str(version))


async def check_redis(redis: SupportsPing) -> ComponentHealth:
    await redis.ping()
    info = await redis.info("server")
    version = info.get("redis_version")
    return ComponentHealth(status="ok", version=str(version) if version else None)


async def _disabled() -> ComponentHealth:
    return ComponentHealth(status="disabled", detail="REDIS_URL not set")


def live_health(status: dict[str, Any]) -> LiveHealth:
    fetched: datetime | None = status.get("fetched_at")
    return LiveHealth(
        source=status.get("source"),
        fetched_at=fetched,
        age_s=round((datetime.now(UTC) - fetched).total_seconds()) if fetched else None,
        aircraft=status.get("aircraft"),
        last_error=status.get("last_error"),
        providers={k: ProviderHealth(**v) for k, v in status.get("providers", {}).items()},
    )


async def get_health(
    *,
    engine: AsyncEngine,
    redis: SupportsPing | None,
    environment: str,
    version: str,
    timeout_s: float,
    live: dict[str, Any] | None = None,
) -> HealthResponse:
    database, postgis, redis_state = await asyncio.gather(
        _guarded("database", lambda: check_database(engine), timeout_s),
        _guarded("postgis", lambda: check_postgis(engine), timeout_s),
        _guarded("redis", (lambda: check_redis(redis)) if redis else _disabled, timeout_s),
    )
    checks = HealthChecks(database=database, postgis=postgis, redis=redis_state)
    all_ok = all(c.status != "error" for c in (database, postgis, redis_state))
    return HealthResponse(
        status="ok" if all_ok else "degraded",
        environment=environment,
        version=version,
        checks=checks,
        live=live_health(live) if live is not None else None,
    )
