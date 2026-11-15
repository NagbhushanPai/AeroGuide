"""The MCP fare search tool (ADR-0014, ADR-0015).

Uses the same search service as the website, so results, the 10-minute cache and the request
budget are shared. Live searches by assistants are marked with the "mcp" budget channel, which
has its own daily cap (FARES_MCP_DAILY_REQUEST_CAP) inside the site's caps. There is no booking
tool: each result links to the website's /fares page with the search filled in, where the
traveller presses Book.
"""

import logging
from collections.abc import Callable
from datetime import date, datetime
from typing import Annotated, Literal
from urllib.parse import urlencode

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field, ValidationError

from app.api.deps import AppResources
from app.core.config import Settings
from app.fares.budget import budget_channel
from app.schemas.fares import (
    AirlineOption,
    Cabin,
    FareSearchRequest,
    FareSearchResponse,
    Leg,
    Offer,
    Passengers,
    SortBy,
)
from app.services.fares import FareSearchUnavailableError

logger = logging.getLogger(__name__)

CHANNEL = "mcp"
TOP = 10
FARES = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, idempotentHint=False, openWorldHint=True
)
NOT_SET_UP = "Fare search isn't set up on AeroGuide's server."

Iata = Annotated[
    str, Field(pattern=r"^[A-Za-z]{3}$", description="Indian airport IATA code, e.g. DEL")
]


class LegBrief(BaseModel):
    flights: list[str] = Field(description="Flight numbers, e.g. 6E2134")
    airlines: list[str]
    departs: str = Field(description="Local time (IST), ISO 8601 without offset")
    arrives: str = Field(description="Local time (IST); may be the next day")
    duration_minutes: int
    stops: int
    via: list[str] = Field(description="Connection airports")


class FareBrief(BaseModel):
    price: float = Field(description="Total for all passengers")
    currency: str
    price_confirmed: bool = Field(description="False: the source couldn't confirm the price")
    cabin: str | None
    outbound: LegBrief
    inbound: LegBrief | None


class FareSearchSummary(BaseModel):
    route: str
    departure_date: date
    return_date: date | None
    passengers: Passengers
    cabin: Cabin
    sort: SortBy
    fares: list[FareBrief] = Field(description=f"Up to {TOP}, in the sort order")
    matching: int = Field(description="Fares matching the filters")
    total: int = Field(description="Fares found before filters")
    excluded_abroad: int = Field(description="Left out because they connect outside India")
    airlines: list[AirlineOption]
    cheapest_price: float | None = Field(description="Among the matching fares")
    fastest_minutes: int | None = Field(description="Among the matching fares")
    fetched_at: datetime | None = Field(description="When the prices were fetched (UTC)")
    from_cache: bool = Field(description="True: reused a recent search, no new request")
    is_demo: bool = Field(description="True: generated demo fares, not real prices")
    search_url: str = Field(description="The website's fares page with this search filled in")
    notice: str
    allowance_note: str | None = Field(description="Shown when the search allowance runs low")


def _leg(leg: Leg) -> LegBrief:
    return LegBrief(
        flights=leg.flight_numbers,
        airlines=leg.carrier_names,
        departs=leg.departure_local,
        arrives=leg.arrival_local,
        duration_minutes=leg.duration_minutes,
        stops=leg.stops,
        via=[s.destination for s in leg.segments[:-1]],
    )


def _brief(o: Offer) -> FareBrief:
    return FareBrief(
        price=o.price,
        currency=o.currency,
        price_confirmed=o.price_verified,
        cabin=o.cabin,
        outbound=_leg(o.outbound),
        inbound=_leg(o.inbound) if o.inbound else None,
    )


def search_url(site_url: str, req: FareSearchRequest) -> str:
    """The /fares page with the same search filled in (the website's URL format)."""
    p = req.passengers
    params: dict[str, str] = {
        "from": req.origin,
        "to": req.destination,
        "depart": req.departure_date.isoformat(),
    }
    if req.return_date is not None:
        params |= {"trip": "round", "return": req.return_date.isoformat()}
    for key, value, default in (
        ("adults", p.adults, 1),
        ("children", p.children, 0),
        ("seat", p.infants_in_seat, 0),
        ("lap", p.infants_on_lap, 0),
    ):
        if value != default:
            params[key] = str(value)
    if req.cabin != "economy":
        params["cabin"] = req.cabin
    if req.sort != "best":
        params["sort"] = req.sort
    return f"{site_url.rstrip('/')}/fares?{urlencode(params)}"


def summarise(r: FareSearchResponse, req: FareSearchRequest, site_url: str) -> FareSearchSummary:
    matching = r.offers
    return FareSearchSummary(
        route=f"{r.origin}-{r.destination}",
        departure_date=r.departure_date,
        return_date=r.return_date,
        passengers=r.passengers,
        cabin=r.cabin,
        sort=r.sort,
        fares=[_brief(o) for o in matching[:TOP]],
        matching=len(matching),
        total=r.total_offers,
        excluded_abroad=r.excluded_abroad,
        airlines=r.airlines,
        cheapest_price=min((o.price for o in matching), default=None),
        fastest_minutes=min((o.total_duration_minutes for o in matching), default=None),
        fetched_at=r.fetched_at,
        from_cache=r.cached,
        is_demo=r.is_demo,
        search_url=search_url(site_url, req),
        notice=r.notice,
        allowance_note=r.budget.message if r.budget and r.budget.near_limit else None,
    )


def register_fare_tools(
    mcp: FastMCP, get_resources: Callable[[], AppResources], settings: Settings
) -> None:
    @mcp.tool(title="Search flight fares", annotations=FARES)
    async def search_flights(
        origin: Iata,
        destination: Iata,
        departure_date: Annotated[date, Field(description="YYYY-MM-DD, today or later (IST)")],
        return_date: Annotated[
            date | None, Field(description="For a round trip; omit for one way")
        ] = None,
        adults: Annotated[int, Field(ge=1, le=9)] = 1,
        children: Annotated[int, Field(ge=0, le=8)] = 0,
        infants_in_seat: Annotated[int, Field(ge=0, le=8)] = 0,
        infants_on_lap: Annotated[int, Field(ge=0, le=8)] = 0,
        cabin: Cabin = "economy",
        sort: Annotated[
            Literal["best", "cheapest", "fastest"],
            Field(description="best weighs price, duration and stops"),
        ] = "best",
        max_stops: Annotated[int | None, Field(ge=0, le=3)] = None,
        airlines: Annotated[
            list[str] | None,
            Field(max_length=10, description="Only these airlines (IATA codes, e.g. 6E, AI, QP)"),
        ] = None,
        depart_after_hour: Annotated[int | None, Field(ge=0, le=23, description="IST")] = None,
        depart_before_hour: Annotated[int | None, Field(ge=1, le=24, description="IST")] = None,
        max_price: Annotated[int | None, Field(ge=1, description="Total, in INR")] = None,
    ) -> FareSearchSummary:
        """Compare fares on Indian domestic flights (one way or round trip), from the Ignav API.

        Use judiciously: each new combination of route, dates, passengers and cabin uses one
        live search from a small daily allowance shared by all AI assistants. Repeating a
        search within 10 minutes, or changing only the sort or filters, reuses the result at
        no cost. So ask the traveller for their route and date before searching, don't scan
        many dates or routes to find the cheapest day, and refine with filters instead of new
        searches. Returns up to 10 fares and a link to AeroGuide's fares page, where the
        traveller compares all results and books. Prices change: the seller confirms them."""
        resources = get_resources()
        service = resources.fares
        if service is None or not service.configured:
            raise ToolError(NOT_SET_UP)
        try:
            req = FareSearchRequest(
                origin=origin.upper(),
                destination=destination.upper(),
                departure_date=departure_date,
                return_date=return_date,
                passengers=Passengers(
                    adults=adults,
                    children=children,
                    infants_in_seat=infants_in_seat,
                    infants_on_lap=infants_on_lap,
                ),
                cabin=cabin,
                sort=sort,
                max_stops=max_stops,
                airlines=airlines or [],
                depart_after_hour=depart_after_hour,
                depart_before_hour=depart_before_hour,
                max_price=max_price,
                nearby_airports=False,  # extra airports cost extra requests: website only
            )
        except ValidationError as exc:
            first = exc.errors()[0]
            raise ToolError(
                f"Invalid search: {first['msg'].removeprefix('Value error, ')}"
            ) from exc

        token = budget_channel.set(CHANNEL)
        try:
            result = await service.search(req)
        except FareSearchUnavailableError as exc:
            raise ToolError(exc.message) from exc
        finally:
            budget_channel.reset(token)
        return summarise(result, req, settings.site_url)
