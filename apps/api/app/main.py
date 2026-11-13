"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.deps import AppResources
from app.api.v1 import api_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.database.redis import create_redis
from app.database.session import create_engine


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(str(settings.database_url))
        redis = create_redis(str(settings.redis_url))
        app.state.resources = AppResources(settings=settings, engine=engine, redis=redis)
        try:
            yield
        finally:
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
    return app


app = create_app()
