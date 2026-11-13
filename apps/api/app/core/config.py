"""Application settings, read from environment variables (twelve-factor)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, RedisDsn, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["local", "test", "preview", "production"] = "local"
    log_level: str = "INFO"

    database_url: PostgresDsn = Field(
        default=PostgresDsn("postgresql+asyncpg://aeroguide:aeroguide@localhost:5432/aeroguide"),
        description="Async SQLAlchemy URL (postgresql+asyncpg://...).",
    )
    redis_url: RedisDsn = Field(
        default=RedisDsn("redis://localhost:6379/0"),
        description="Use rediss:// for TLS (for example Upstash).",
    )

    # Comma-separated in the environment, for example "http://localhost:3000,https://example.org".
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    health_check_timeout_s: float = 2.0

    # Live data (ADR-0004, ADR-0011, ADR-0012). Comma-separated, tried in order.
    position_providers: Annotated[list[str], NoDecode] = ["adsblol", "adsbfi", "opensky"]
    route_lookups_enabled: bool = True
    # One sweep a minute fits adsb.lol's 10 requests/minute limit (see adsblol.GRID).
    snapshot_ttl_s: float = 60.0
    route_lookups_per_refresh: int = 10
    upstream_timeout_s: float = 12.0

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
