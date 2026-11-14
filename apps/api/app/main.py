"""FastAPI application factory."""

import logging
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.deps import AppResources
from app.api.v1 import api_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.database.redis import RedisKeyValue, create_redis
from app.database.session import create_engine
from app.ingestion.live import LiveService
from app.ingestion.sightings import SightingRecorder
from app.mcp_server import RateLimit, build_mcp
from app.providers.registry import build_position_providers, build_route_lookup

REPO_URL = "https://github.com/NagbhushanPai/AeroGuide"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(str(settings.database_url))
        redis = create_redis(str(settings.redis_url))
        http = httpx.AsyncClient(
            timeout=settings.upstream_timeout_s,
            headers={"User-Agent": f"AeroGuide/{__version__} (+{REPO_URL})"},
            follow_redirects=True,
        )
        recorder = (
            SightingRecorder(engine, flush_interval_s=settings.sightings_flush_interval_s)
            if settings.sightings_enabled
            else None
        )
        live = LiveService(
            build_position_providers(settings.position_providers, http),
            build_route_lookup(settings.route_lookups_enabled, http),
            RedisKeyValue(redis),
            ttl_s=settings.snapshot_ttl_s,
            route_lookups_per_refresh=settings.route_lookups_per_refresh,
            on_snapshot=recorder,
        )
        await live.warm_start()
        app.state.resources = AppResources(settings=settings, engine=engine, redis=redis, live=live)
        try:
            async with AsyncExitStack() as stack:
                if mcp is not None:
                    await stack.enter_async_context(mcp.session_manager.run())
                yield
        finally:
            await live.aclose()
            if recorder is not None:
                try:
                    await recorder.flush()  # don't lose the last few minutes on shutdown
                except Exception as exc:
                    logging.getLogger(__name__).warning("final sightings flush failed: %s", exc)
            await http.aclose()
            await redis.aclose()
            await engine.dispose()

    app = FastAPI(
        title="AeroGuide API",
        version=__version__,
        lifespan=lifespan,
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    # MCP for AI assistants at /mcp (ADR-0014). Mounted last so the API routes match first.
    mcp = build_mcp(lambda: app.state.resources, settings) if settings.mcp_enabled else None
    app.state.mcp = mcp
    if mcp is not None:
        app.mount("/", RateLimit(mcp.streamable_http_app(), settings.mcp_rate_limit_per_minute))
    return app


app = create_app()
