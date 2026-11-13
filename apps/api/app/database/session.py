"""Async database engine."""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine


def create_engine(database_url: str) -> AsyncEngine:
    # pool_pre_ping survives the managed database dropping idle connections (free tiers do this).
    return create_async_engine(database_url, pool_pre_ping=True, pool_size=5, max_overflow=5)
