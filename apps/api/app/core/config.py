"""Application settings, read from environment variables (twelve-factor)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, RedisDsn, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

SYNC_SCHEMES = ("postgres://", "postgresql://", "postgresql+psycopg://", "postgresql+psycopg2://")


def normalise_database_url(url: str) -> str:
    """Use the asyncpg driver, and asyncpg's `ssl` parameter in place of libpq's `sslmode`."""
    url = url.strip()
    for scheme in SYNC_SCHEMES:
        if url.startswith(scheme):
            url = "postgresql+asyncpg://" + url.removeprefix(scheme)
            break
    base, sep, query = url.partition("?")
    if sep:
        params = [
            "ssl=" + p.removeprefix("sslmode=") if p.startswith("sslmode=") else p
            for p in query.split("&")
        ]
        url = f"{base}?{'&'.join(params)}"
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["local", "test", "preview", "production"] = "local"
    log_level: str = "INFO"

    database_url: PostgresDsn = Field(
        default=PostgresDsn("postgresql+asyncpg://aeroguide:aeroguide@localhost:5432/aeroguide"),
        description="Async SQLAlchemy URL (postgresql+asyncpg://...).",
    )
    redis_url: RedisDsn | None = Field(
        default=None,
        description="Optional. Use rediss:// for TLS (for example Upstash). Unset = no Redis: "
        "the live snapshot and route caches stay in memory.",
    )
    # Database request limits, so a hung pooler fails fast instead of holding a request.
    db_connect_timeout_s: float = 5.0
    db_command_timeout_s: float = 15.0

    # Comma-separated in the environment, for example "http://localhost:3000,https://example.org".
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    health_check_timeout_s: float = 2.0

    # Live data (ADR-0004, ADR-0011, ADR-0012). Comma-separated, tried in order.
    position_providers: Annotated[list[str], NoDecode] = ["adsblol", "adsbfi", "opensky"]
    # OpenSky API client (OAuth2 client credentials). Optional: without it OpenSky is used
    # anonymously, with a small per-IP allowance shared with other apps on the same host.
    opensky_client_id: str | None = None
    opensky_client_secret: SecretStr | None = None
    route_lookups_enabled: bool = True
    # One sweep a minute fits adsb.lol's 10 requests/minute limit (see adsblol.GRID).
    snapshot_ttl_s: float = 60.0
    route_lookups_per_refresh: int = 10
    upstream_timeout_s: float = 12.0
    # Longest one provider's whole sweep may take before the next provider is tried.
    provider_timeout_s: float = 45.0
    # Longest a request waits for the very first snapshot (then it gets "unavailable").
    first_snapshot_wait_s: float = 10.0
    # Per-client rate limit on the REST API (the MCP endpoint has its own).
    api_rate_limit_per_minute: int = 120
    max_request_bytes: int = 16_384
    # Record airline sightings at airports from the live snapshot (needs the database).
    sightings_enabled: bool = True
    sightings_flush_interval_s: float = 300.0

    # MCP server at /mcp (ADR-0014): read-only tools for AI assistants.
    mcp_enabled: bool = True
    # Host headers the MCP endpoint answers to (DNS-rebinding protection). Render sets
    # RENDER_EXTERNAL_HOSTNAME itself, and it is added automatically (see mcp_hosts).
    mcp_allowed_hosts: Annotated[list[str], NoDecode] = [
        "localhost:*",
        "127.0.0.1:*",
        "[::1]:*",
        "test",
    ]
    render_external_hostname: str | None = None
    # Requests per minute per client address. One assistant task makes several tool calls.
    mcp_rate_limit_per_minute: int = Field(default=60, ge=1)

    @property
    def mcp_hosts(self) -> list[str]:
        extra = [self.render_external_hostname] if self.render_external_hostname else []
        return [*self.mcp_allowed_hosts, *extra]

    @field_validator("mcp_allowed_hosts", mode="before")
    @classmethod
    def split_hosts(cls, value: object) -> object:
        if isinstance(value, str):
            return [host.strip() for host in value.split(",") if host.strip()]
        return value

    @field_validator("redis_url", mode="before")
    @classmethod
    def blank_redis_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("database_url", mode="before")
    @classmethod
    def use_asyncpg(cls, value: object) -> object:
        """Accept URLs as hosting dashboards show them (Supabase: postgresql://...)."""
        if isinstance(value, str):
            return normalise_database_url(value)
        return value

    @field_validator("position_providers", mode="before")
    @classmethod
    def split_providers(cls, value: object) -> object:
        if isinstance(value, str):
            return [p.strip().lower() for p in value.split(",") if p.strip()]
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
