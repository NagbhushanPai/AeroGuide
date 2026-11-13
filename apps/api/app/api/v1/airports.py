import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import AppResources, get_resources
from app.core.india import Region, today_ist
from app.schemas.airports import AirportDetail, AirportList
from app.services.airports import get_airport, search_airports

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/airports", tags=["airports"])

# Content changes only when the seed runs, so short shared caching is safe.
CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600"
UNAVAILABLE = "Airport data is unavailable right now. Try again in a moment."


@router.get(
    "",
    response_model=AirportList,
    summary="Search airports",
    description=(
        "Indian airports with scheduled passenger service. `q` matches IATA or ICAO codes "
        "exactly, and name, city or state partially (typo-tolerant). Exact code matches rank first."
    ),
    responses={503: {"description": "Database unavailable"}},
)
async def list_airports(
    resources: Annotated[AppResources, Depends(get_resources)],
    response: Response,
    q: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    region: Region | None = None,
    guides_only: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AirportList:
    try:
        async with resources.engine.connect() as conn:
            result = await search_airports(
                conn,
                q=q.strip() if q and q.strip() else None,
                region=region,
                guides_only=guides_only,
                limit=limit,
                offset=offset,
                today=today_ist(),
            )
    except (SQLAlchemyError, OSError) as exc:
        logger.warning("airport search failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=503, detail=UNAVAILABLE) from exc
    response.headers["Cache-Control"] = CACHE_CONTROL
    return result


@router.get(
    "/{code}",
    response_model=AirportDetail,
    summary="Airport detail",
    description="By IATA (3 letters) or ICAO (4 letters) code, with terminals and provenance.",
    responses={
        404: {"description": "Unknown airport"},
        503: {"description": "Database unavailable"},
    },
)
async def airport_detail(
    resources: Annotated[AppResources, Depends(get_resources)],
    response: Response,
    code: Annotated[str, Path(pattern=r"^[A-Za-z]{3,4}$")],
) -> AirportDetail:
    try:
        async with resources.engine.connect() as conn:
            airport = await get_airport(conn, code, today_ist())
    except (SQLAlchemyError, OSError) as exc:
        logger.warning("airport detail failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=503, detail=UNAVAILABLE) from exc
    if airport is None:
        raise HTTPException(status_code=404, detail=f"No airport with code {code.upper()}")
    response.headers["Cache-Control"] = CACHE_CONTROL
    return airport
