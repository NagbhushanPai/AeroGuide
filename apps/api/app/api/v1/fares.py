"""Fare search API (ADR-0015). Airport autocomplete is GET /api/v1/airports?q= (our own data,
so it never costs an upstream request)."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.deps import AppResources, get_resources
from app.schemas.fares import (
    BookingLinksRequest,
    BookingLinksResponse,
    BudgetStatus,
    FareSearchRequest,
    FareSearchResponse,
)
from app.services.fares import FareSearchService, FareSearchUnavailableError

router = APIRouter(prefix="/fares", tags=["fares"])

Resources = Annotated[AppResources, Depends(get_resources)]
ERRORS: dict[int | str, dict[str, Any]] = {
    404: {"description": "Unknown fare source or expired fare (booking links)"},
    429: {"description": "Request budget reached, or too many requests from this client"},
    502: {"description": "The fare source refused or failed the search"},
    503: {"description": "Fare search isn't set up, or the budget can't be checked"},
    504: {"description": "The fare source took too long"},
}
NOT_SET_UP = "Fare search isn't set up on this server."


def _service(resources: AppResources) -> FareSearchService:
    if resources.fares is None or not resources.fares.configured:
        raise HTTPException(status_code=503, detail=NOT_SET_UP)
    return resources.fares


@router.post(
    "/search",
    response_model=FareSearchResponse,
    summary="Search and compare fares",
    description=(
        "One-way, or round trip with return_date. Results are cached for a few minutes per "
        "route, dates, passengers and cabin; filters and sort apply to the cached results, so "
        "changing them doesn't cost an upstream request. Prices are totals for all passengers."
    ),
    responses=ERRORS,
)
async def search(
    resources: Resources, response: Response, body: FareSearchRequest
) -> FareSearchResponse:
    service = _service(resources)
    try:
        result = await service.search(body)
    except FareSearchUnavailableError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post(
    "/booking-links",
    response_model=BookingLinksResponse,
    summary="Where to book an offer",
    description="Pass an offer's booking.provider and booking.reference. Costs one upstream "
    "request the first time per offer (then cached).",
    responses=ERRORS,
)
async def booking_links(
    resources: Resources, response: Response, body: BookingLinksRequest
) -> BookingLinksResponse:
    service = _service(resources)
    try:
        result = await service.booking_links(body)
    except FareSearchUnavailableError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get(
    "/budget",
    response_model=BudgetStatus | None,
    summary="Fare search allowance",
    description="How many upstream requests are used of the cap; null without a paid source.",
    responses={503: {"description": "Fare search isn't set up"}},
)
async def budget(resources: Resources, response: Response) -> BudgetStatus | None:
    service = _service(resources)
    response.headers["Cache-Control"] = "no-store"
    return await service.budget_status()
