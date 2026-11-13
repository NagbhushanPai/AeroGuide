"""Health-check response contract."""

from typing import Literal

from pydantic import BaseModel, Field

ComponentState = Literal["ok", "error"]


class ComponentHealth(BaseModel):
    status: ComponentState
    version: str | None = Field(default=None, description="Server version, when known.")
    detail: str | None = Field(default=None, description="Error summary when status is 'error'.")


class HealthChecks(BaseModel):
    database: ComponentHealth
    postgis: ComponentHealth
    redis: ComponentHealth


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    environment: str
    version: str
    checks: HealthChecks
