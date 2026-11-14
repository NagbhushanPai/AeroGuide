"""Request dependencies. Resources are created once in the app lifespan and stored on app.state."""

from dataclasses import dataclass

from fastapi import Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.ingestion.live import LiveService


@dataclass(frozen=True, slots=True)
class AppResources:
    settings: Settings
    engine: AsyncEngine
    redis: "Redis | None"  # None when REDIS_URL isn't set
    live: LiveService


def get_resources(request: Request) -> AppResources:
    resources: AppResources = request.app.state.resources
    return resources
