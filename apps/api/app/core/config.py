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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
