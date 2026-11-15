"""FastAPI application factory."""

import logging
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine

from app import __version__
from app.api.deps import AppResources
from app.api.v1 import api_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.database.redis import RedisKeyValue, create_redis
from app.database.session import create_engine
from app.fares.budget import BudgetGuard, BudgetPolicy, PostgresUsageLedger
from app.fares.cache import FareCache, InMemoryFareCache, RedisFareCache
from app.fares.ranking import Weights
from app.ingestion.live import LiveService
from app.ingestion.sightings import SightingRecorder
from app.mcp_server import RateLimit, build_mcp
from app.mcp_server.ratelimit import BodyLimit
from app.providers.registry import (
    build_fare_providers,
    build_position_providers,
    build_route_lookup,
)
from app.services.fares import DatabaseAirportCodes, FareSearchService

REPO_URL = "https://github.com/NagbhushanPai/AeroGuide"


def build_fare_service(
    settings: Settings, http: httpx.AsyncClient, engine: AsyncEngine, redis: "Redis | None"
) -> FareSearchService:
    """Fare search (ADR-0015): providers, the Postgres request budget and the result cache."""
    budget = BudgetGuard(
        PostgresUsageLedger(engine),
        BudgetPolicy(
            total_cap=settings.fares_total_request_cap,
            monthly_cap=settings.fares_monthly_request_cap,
            daily_cap=settings.fares_daily_request_cap,
            warn_ratio=settings.fares_budget_warn_ratio,
        ),
        channel_daily_caps={"mcp": settings.fares_mcp_daily_request_cap},
        channel_refusal=lambda _channel, cap: (
            f"AI assistants have used today's {cap:,} live fare searches on AeroGuide. Searches "
            f"made in the last 10 minutes still work, or search at {settings.site_url}/fares. "
            "The allowance resets at midnight IST."
        ),
    )
    providers = build_fare_providers(
        settings.fare_providers,
        http,
        budget,
        ignav_api_key=settings.ignav_api_key.get_secret_value() if settings.ignav_api_key else None,
        ignav_base_url=settings.ignav_base_url,
        ignav_market=settings.ignav_market,
        ignav_timeout_s=settings.ignav_timeout_s,
        ignav_max_retries=settings.ignav_max_retries,
        ignav_min_interval_s=settings.ignav_min_interval_s,
        ignav_max_concurrent=settings.ignav_max_concurrent,
    )
    cache: FareCache = RedisFareCache(redis) if redis is not None else InMemoryFareCache()
    return FareSearchService(
        providers,
        cache,
        budget=budget,
        currency_key=f"market-{settings.ignav_market}",
        cache_ttl_s=settings.fares_cache_ttl_s,
        provider_timeout_s=settings.fares_provider_timeout_s,
        weights=Weights.parse(settings.fares_best_weights),
        airports=DatabaseAirportCodes(engine),
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(
            str(settings.database_url),
            connect_timeout_s=settings.db_connect_timeout_s,
            command_timeout_s=settings.db_command_timeout_s,
        )
        redis = create_redis(str(settings.redis_url)) if settings.redis_url else None
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
            build_position_providers(
                settings.position_providers,
                http,
                settings.opensky_client_id,
                settings.opensky_client_secret.get_secret_value()
                if settings.opensky_client_secret
                else None,
            ),
            build_route_lookup(settings.route_lookups_enabled, http),
            RedisKeyValue(redis) if redis is not None else None,
            ttl_s=settings.snapshot_ttl_s,
            provider_timeout_s=settings.provider_timeout_s,
            first_wait_s=settings.first_snapshot_wait_s,
            route_lookups_per_refresh=settings.route_lookups_per_refresh,
            on_snapshot=recorder,
        )
        await live.warm_start()
        app.state.resources = AppResources(
            settings=settings,
            engine=engine,
            redis=redis,
            live=live,
            fares=build_fare_service(settings, http, engine, redis),
        )
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
            if redis is not None:
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
    # Outermost first: refuse oversized bodies, then rate-limit the REST API per client.
    # /mcp has its own limit below; health checks aren't counted.
    app.add_middleware(
        RateLimit,
        per_minute=settings.api_rate_limit_per_minute,
        exempt=("/api/v1/health", "/mcp"),
    )
    # Fare search spends a paid request budget: a tighter per-client limit on top.
    app.add_middleware(
        RateLimit, per_minute=settings.fares_rate_limit_per_minute, only=("/api/v1/fares/",)
    )
    app.add_middleware(BodyLimit, max_bytes=settings.max_request_bytes)

    # MCP for AI assistants at /mcp (ADR-0014). Mounted last so the API routes match first.
    mcp = build_mcp(lambda: app.state.resources, settings) if settings.mcp_enabled else None
    app.state.mcp = mcp
    if mcp is not None:
        app.mount("/", RateLimit(mcp.streamable_http_app(), settings.mcp_rate_limit_per_minute))
    return app


app = create_app()
