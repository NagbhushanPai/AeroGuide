"""Health-check response contract."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ComponentState = Literal["ok", "error", "disabled"]


class ComponentHealth(BaseModel):
    status: ComponentState
    version: str | None = Field(default=None, description="Server version, when known.")
    detail: str | None = Field(default=None, description="Error summary when status is 'error'.")


class HealthChecks(BaseModel):
    database: ComponentHealth
    postgis: ComponentHealth
    redis: ComponentHealth


class ProviderHealth(BaseModel):
    ok: bool | None = Field(description="Result of its last sweep; null if not tried yet")
    checked_at: datetime | None
    error: str | None
    aircraft: int | None
    resting_s: int = Field(description="Seconds left resting after a rate limit")


class LiveHealth(BaseModel):
    """The live position pipeline in this process."""

    source: str | None = Field(description="Provider behind the current snapshot")
    fetched_at: datetime | None
    age_s: int | None = Field(description="Seconds since the snapshot was fetched")
    aircraft: int | None
    last_error: str | None
    providers: dict[str, ProviderHealth]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    environment: str
    version: str
    checks: HealthChecks
    live: LiveHealth | None = None
