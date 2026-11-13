import logging
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.deps import AppResources, get_resources
from app.core.india import today_ist
from app.schemas.lounges import (
    CardDetail,
    CardList,
    EligibilityRequest,
    EligibilityResponse,
    LoungeDetail,
    LoungeList,
    ProgramList,
)
from app.services import lounges as svc

logger = logging.getLogger(__name__)
router = APIRouter(tags=["lounges and cards"])

CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600"
UNAVAILABLE = "Lounge and card data is unavailable right now. Try again in a moment."
DB_DOWN: dict[int | str, dict[str, Any]] = {503: {"description": "Database unavailable"}}
NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"description": "Not found"}, **DB_DOWN}
SlugPath = Annotated[str, Path(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=80)]


async def _run[T](
    resources: AppResources, what: str, fn: Callable[[AsyncConnection], Awaitable[T]]
) -> T:
    try:
        async with resources.engine.connect() as conn:
            return await fn(conn)
    except (SQLAlchemyError, OSError) as exc:
        logger.warning("%s failed: %s: %s", what, type(exc).__name__, exc)
        raise HTTPException(status_code=503, detail=UNAVAILABLE) from exc


def _found[T](value: T | None, what: str) -> T:
    if value is None:
        raise HTTPException(status_code=404, detail=f"No {what}")
    return value


Resources = Annotated[AppResources, Depends(get_resources)]


@router.get("/lounges", response_model=LoungeList, summary="List lounges", responses=DB_DOWN)
async def lounges(
    resources: Resources,
    response: Response,
    airport: Annotated[str | None, Query(pattern=r"^[A-Za-z]{3}$")] = None,
    program: Annotated[str | None, Query(pattern=r"^[a-z0-9-]{1,80}$")] = None,
) -> LoungeList:
    result = await _run(
        resources,
        "lounge list",
        lambda c: svc.list_lounges(c, airport=airport, program=program, today=today_ist()),
    )
    response.headers["Cache-Control"] = CACHE_CONTROL
    return result


@router.get("/lounges/{slug}", response_model=LoungeDetail, summary="Lounge", responses=NOT_FOUND)
async def lounge(resources: Resources, response: Response, slug: SlugPath) -> LoungeDetail:
    result = await _run(resources, "lounge", lambda c: svc.get_lounge(c, slug, today_ist()))
    response.headers["Cache-Control"] = CACHE_CONTROL
    return _found(result, f"lounge {slug}")


@router.get("/cards", response_model=CardList, summary="List cards", responses=DB_DOWN)
async def cards(
    resources: Resources,
    response: Response,
    bank: Annotated[str | None, Query(pattern=r"^[a-z0-9-]{1,80}$")] = None,
) -> CardList:
    result = await _run(
        resources, "card list", lambda c: svc.list_cards(c, bank=bank, today=today_ist())
    )
    response.headers["Cache-Control"] = CACHE_CONTROL
    return result


@router.get("/cards/{slug}", response_model=CardDetail, summary="Card", responses=NOT_FOUND)
async def card(resources: Resources, response: Response, slug: SlugPath) -> CardDetail:
    result = await _run(resources, "card", lambda c: svc.get_card(c, slug, today_ist()))
    response.headers["Cache-Control"] = CACHE_CONTROL
    return _found(result, f"card {slug}")


@router.get(
    "/access-programs", response_model=ProgramList, summary="Lounge programmes", responses=DB_DOWN
)
async def programs(resources: Resources, response: Response) -> ProgramList:
    result = await _run(resources, "programmes", svc.list_programs)
    response.headers["Cache-Control"] = CACHE_CONTROL
    return result


@router.post(
    "/eligibility",
    response_model=EligibilityResponse,
    summary="Check lounge access for your cards",
    description=(
        "Runs the deterministic eligibility engine for each card against every lounge we list "
        "at the airport. Answers are yes, no or depends, each with the checks behind it. "
        "Nothing in the request is stored or logged. Never send card numbers."
    ),
    responses={404: {"description": "Unknown airport"}, **DB_DOWN},
)
async def eligibility(
    resources: Resources, response: Response, body: EligibilityRequest
) -> EligibilityResponse:
    result: EligibilityResponse | None = await _run(
        resources, "eligibility", lambda c: svc.check_eligibility(c, body, today_ist())
    )
    response.headers["Cache-Control"] = "no-store"
    return _found(result, f"airport {body.airport.upper()}")
