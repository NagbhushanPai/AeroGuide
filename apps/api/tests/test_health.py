import httpx
import pytest
from redis.asyncio import Redis

from app.api.deps import AppResources
from app.core.config import Settings
from app.database.redis import create_redis
from app.database.session import create_engine
from app.ingestion.live import LiveService
from app.main import create_app
from app.providers.positions.demo import DemoProvider
from app.services.health import check_redis, get_health


class FakeRedis:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail

    async def ping(self) -> bool:
        if self.fail:
            raise ConnectionError("redis down")
        return True

    async def info(self, section: str) -> dict[str, object]:
        return {"redis_version": "7.4.0"}


# Port 1 on localhost refuses connections immediately: a deterministic "database down".
UNREACHABLE_DB = "postgresql+asyncpg://user:pass@127.0.0.1:1/none"


async def test_redis_check_reports_version() -> None:
    result = await check_redis(FakeRedis())
    assert result.status == "ok"
    assert result.version == "7.4.0"


async def test_health_is_degraded_when_dependencies_fail() -> None:
    engine = create_engine(UNREACHABLE_DB)
    try:
        result = await get_health(
            engine=engine,
            redis=FakeRedis(fail=True),
            environment="test",
            version="0.0.0",
            timeout_s=2.0,
        )
    finally:
        await engine.dispose()

    assert result.status == "degraded"
    assert result.checks.database.status == "error"
    assert result.checks.postgis.status == "error"
    assert result.checks.redis.status == "error"
    assert result.checks.redis.detail == "ConnectionError"


async def test_health_endpoint_returns_200_with_degraded_body() -> None:
    settings = Settings(environment="test", database_url=UNREACHABLE_DB, health_check_timeout_s=2.0)
    app = create_app(settings)
    engine = create_engine(UNREACHABLE_DB)
    live = LiveService([DemoProvider()], None, None)
    app.state.resources = AppResources(
        settings=settings,
        engine=engine,
        redis=FakeRedis(True),  # type: ignore[arg-type]
        live=live,
    )
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/health")
    finally:
        await engine.dispose()

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["environment"] == "test"
    assert set(body["checks"]) == {"database", "postgis", "redis"}


def test_cors_origins_accepts_comma_separated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://a.test, http://b.test")
    assert Settings().cors_origins == ["http://a.test", "http://b.test"]


@pytest.mark.integration
async def test_health_ok_against_real_services() -> None:
    """Needs `docker compose up` and `alembic upgrade head` (postgis enabled)."""
    settings = Settings()
    engine = create_engine(str(settings.database_url))
    redis: Redis = create_redis(str(settings.redis_url))
    try:
        result = await get_health(
            engine=engine, redis=redis, environment="test", version="0.0.0", timeout_s=5.0
        )
    finally:
        await redis.aclose()
        await engine.dispose()

    assert result.status == "ok", result.model_dump()
    assert result.checks.postgis.version is not None
