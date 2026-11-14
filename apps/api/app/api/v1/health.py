from typing import Annotated

from fastapi import APIRouter, Depends

from app import __version__
from app.api.deps import AppResources, get_resources
from app.schemas.health import HealthResponse
from app.services.health import get_health

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health",
    description=(
        "Liveness plus dependency status. Always returns 200 while the process is up; "
        "`status` is `degraded` when the database, PostGIS or Redis is unavailable. `live` "
        "reports the last live-position sweep per provider (this process only)."
    ),
)
async def health(resources: Annotated[AppResources, Depends(get_resources)]) -> HealthResponse:
    return await get_health(
        engine=resources.engine,
        redis=resources.redis,
        environment=resources.settings.environment,
        version=__version__,
        timeout_s=resources.settings.health_check_timeout_s,
        live=resources.live.status(),
    )
