"""Async database engine."""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine


def create_engine(
    database_url: str, *, connect_timeout_s: float = 5.0, command_timeout_s: float = 15.0
) -> AsyncEngine:
    # pool_pre_ping survives the managed database dropping idle connections (free tiers do this).
    # Timeouts are client-side (asyncpg), so they also work through connection poolers that
    # refuse startup parameters such as statement_timeout. pool_timeout bounds the wait for a
    # free connection.
    return create_async_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        pool_timeout=10,
        connect_args={"timeout": connect_timeout_s, "command_timeout": command_timeout_s},
    )
