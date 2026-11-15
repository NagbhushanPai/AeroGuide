"""AeroGuide's MCP server (ADR-0014): read-only tools over the same services the website uses.

Every tool returns the service's own typed result, including sources and verification status,
so an assistant can cite where each fact comes from. Eligibility comes only from the
deterministic engine (ADR-0009); the assistant never works it out itself. Nothing a caller
sends is stored or logged.
"""

import logging
from collections.abc import Awaitable, Callable
from datetime import date
from typing import Annotated, Literal

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.deps import AppResources
from app.core.config import Settings
from app.core.geo import haversine_km
from app.core.india import Region, today_ist
from app.mcp_server.fares import register_fare_tools
from app.schemas.airports import AirlinesSeen, AirportDetail, AirportList
from app.schemas.lounges import (
    CardDetail,
    CardFacts,
    CardList,
    EligibilityRequest,
    EligibilityResponse,
    LoungeDetail,
    LoungeList,
    ProgramList,
)
from app.schemas.positions import AircraftDetail, AircraftProperties, PositionsMeta
from app.services import airports as airport_svc
from app.services import lounges as lounge_svc
from app.services import positions as position_svc

logger = logging.getLogger(__name__)

SITE_URL = "https://github.com/NagbhushanPai/AeroGuide"
UNAVAILABLE = "AeroGuide's database is unavailable right now (it may be starting up). Try again."

INSTRUCTIONS = """\
AeroGuide has open, source-cited data on Indian airports, airport lounges, credit-card lounge
benefits and live flights, and fare search for Indian domestic flights.

Rules for using these tools:
- Answer only from tool results. If the tools don't have it, say so. Never fill gaps from memory.
- Cite the source a result gives (name and URL) and its verification status. Say "unverified"
  or "outdated" when a record is marked that way.
- Lounge access: always call check_lounge_access. Don't work out eligibility yourself. Report
  "depends" as depends, with the checks it lists, and tell the traveller to confirm with the bank.
- Terminals change. Tell travellers to confirm their terminal with the airline or airport.
- Dates are in India time (IST).
- Never ask for or send card numbers. Card products are identified by slugs from list_cards.
- Fares: call search_flights only when the traveller wants prices, after you know the route
  and date. Each new search uses a small shared daily allowance; changing sort or filters, or
  repeating a search within 10 minutes, is free. Don't scan dates or routes. Give the
  search_url so the traveller can see every fare and book, and say prices can change.
"""

READ_ONLY = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
)
LIVE = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, idempotentHint=False, openWorldHint=True
)

AirportCode = Annotated[
    str,
    Field(
        pattern=r"^[A-Za-z]{3,4}$", description="IATA (DEL) or ICAO (VIDP) code; any letter case"
    ),
]
Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=80)]


class NearbyFlight(BaseModel):
    distance_km: float = Field(description="From the airport's reference point")
    lat: float
    lon: float
    aircraft: AircraftProperties


class NearbyFlights(BaseModel):
    airport: str
    radius_km: float
    flights: list[NearbyFlight] = Field(description="Nearest first")
    total_in_radius: int
    meta: PositionsMeta = Field(description="Where the positions came from and how fresh they are")


def build_mcp(get_resources: Callable[[], AppResources], settings: Settings) -> FastMCP:
    mcp = FastMCP(
        "AeroGuide",
        instructions=INSTRUCTIONS,
        website_url=SITE_URL,
        # Stateless JSON: each call stands alone, which survives free-tier restarts.
        stateless_http=True,
        json_response=True,
        streamable_http_path="/mcp",
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=settings.mcp_hosts,
            allowed_origins=settings.cors_origins,
        ),
    )

    async def db[T](what: str, fn: Callable[[AsyncConnection], Awaitable[T]]) -> T:
        try:
            async with get_resources().engine.connect() as conn:
                return await fn(conn)
        except (SQLAlchemyError, OSError) as exc:
            logger.warning("mcp %s failed: %s: %s", what, type(exc).__name__, exc)
            raise ToolError(UNAVAILABLE) from exc

    def found[T](value: T | None, message: str) -> T:
        if value is None:
            raise ToolError(message)
        return value

    @mcp.tool(title="Search airports", annotations=READ_ONLY)
    async def search_airports(
        query: Annotated[
            str | None,
            Field(
                max_length=80,
                description="Code, name, city or state; typo-tolerant. Omit to list airports.",
            ),
        ] = None,
        region: Annotated[Region | None, Field(description="Limit to one region")] = None,
        guides_only: Annotated[
            bool, Field(description="Only airports with a curated guide")
        ] = False,
        limit: Annotated[int, Field(ge=1, le=25)] = 10,
    ) -> AirportList:
        """Find Indian airports with scheduled passenger service. Exact code matches rank first."""
        return await db(
            "airport search",
            lambda c: airport_svc.search_airports(
                c,
                q=query,
                region=region,
                guides_only=guides_only,
                limit=limit,
                offset=0,
                today=today_ist(),
            ),
        )

    @mcp.tool(title="Airport details", annotations=READ_ONLY)
    async def get_airport(code: AirportCode) -> AirportDetail:
        """One airport: location, official website, verified terminals and their airlines, and
        terminals as mapped in OpenStreetMap (shown separately, unverified)."""
        result = await db("airport", lambda c: airport_svc.get_airport(c, code, today_ist()))
        return found(result, f"No airport with code {code.upper()} in AeroGuide.")

    @mcp.tool(title="Airlines seen at an airport", annotations=READ_ONLY)
    async def airlines_seen(
        code: AirportCode, days: Annotated[int, Field(ge=1, le=30)] = 7
    ) -> AirlinesSeen:
        """Airlines whose aircraft were seen on the ground or on approach at this airport in
        recent days, from community ADS-B data. A sign of who flies there, not a timetable."""
        result = await db(
            "airlines seen", lambda c: airport_svc.airlines_seen(c, code, days, today_ist())
        )
        return found(result, f"No airport with code {code.upper()} in AeroGuide.")

    @mcp.tool(title="List lounges", annotations=READ_ONLY)
    async def list_lounges(
        airport: Annotated[
            str | None, Field(pattern=r"^[A-Za-z]{3}$", description="IATA code, for example BOM")
        ] = None,
        program: Annotated[
            str | None,
            Field(
                pattern=r"^[a-z0-9-]{1,80}$",
                description="Programme key from list_lounge_programmes, for example priority-pass",
            ),
        ] = None,
    ) -> LoungeList:
        """Airport lounges AeroGuide has records for, with the programmes each accepts today."""
        return await db(
            "lounge list",
            lambda c: lounge_svc.list_lounges(
                c, airport=airport, program=program, today=today_ist()
            ),
        )

    @mcp.tool(title="Lounge details", annotations=READ_ONLY)
    async def get_lounge(slug: Slug) -> LoungeDetail:
        """One lounge: terminal, location, opening hours, amenities and the programmes it accepts,
        each with its source. A missing amenity means "not stated", not "not available"."""
        result = await db("lounge", lambda c: lounge_svc.get_lounge(c, slug, today_ist()))
        return found(result, f"No lounge {slug}. Use list_lounges to find lounge slugs.")

    @mcp.tool(title="List lounge programmes", annotations=READ_ONLY)
    async def list_lounge_programmes() -> ProgramList:
        """Lounge access programmes (memberships, card networks, bank programmes, paid entry)."""
        return await db("programmes", lounge_svc.list_programs)

    @mcp.tool(title="List cards", annotations=READ_ONLY)
    async def list_cards(
        bank: Annotated[
            str | None,
            Field(pattern=r"^[a-z0-9-]{1,80}$", description="Bank slug, for example hdfc-bank"),
        ] = None,
    ) -> CardList:
        """Credit cards with recorded lounge benefits, and the current benefit summaries."""
        return await db(
            "card list", lambda c: lounge_svc.list_cards(c, bank=bank, today=today_ist())
        )

    @mcp.tool(title="Card details", annotations=READ_ONLY)
    async def get_card(slug: Slug) -> CardDetail:
        """One card's lounge benefit, every version with its dates, rules and source."""
        result = await db("card", lambda c: lounge_svc.get_card(c, slug, today_ist()))
        return found(result, f"No card {slug}. Use list_cards to find card slugs.")

    @mcp.tool(title="Check lounge access", annotations=READ_ONLY)
    async def check_lounge_access(
        cards: Annotated[
            list[Slug], Field(min_length=1, max_length=10, description="Card slugs from list_cards")
        ],
        airport: Annotated[str, Field(pattern=r"^[A-Za-z]{3}$", description="IATA code")],
        scope: Literal["domestic", "international"],
        on: Annotated[date | None, Field(description="Travel date; default today (IST)")] = None,
        guests: Annotated[int, Field(ge=0, le=10)] = 0,
        facts: Annotated[
            dict[str, CardFacts] | None,
            Field(
                description=(
                    "Optional, keyed by card slug: visits already used this period and spend in "
                    "the bank's spend window. Without them, gated benefits answer 'depends'."
                )
            ),
        ] = None,
    ) -> EligibilityResponse:
        """Which of these cards get the traveller into each lounge at the airport: yes, no or
        depends, with the checks behind every answer. Deterministic; nothing is stored."""
        try:
            request = EligibilityRequest(
                cards=cards, airport=airport, on=on, scope=scope, guests=guests, facts=facts or {}
            )
        except ValidationError as exc:
            raise ToolError(f"Invalid request: {exc.errors()[0]['msg']}") from exc
        result = await db(
            "eligibility", lambda c: lounge_svc.check_eligibility(c, request, today_ist())
        )
        return found(result, f"No airport with code {airport.upper()} in AeroGuide.")

    @mcp.tool(title="Flights near an airport", annotations=LIVE)
    async def flights_near_airport(
        code: AirportCode,
        radius_km: Annotated[float, Field(ge=5, le=150)] = 40,
        limit: Annotated[int, Field(ge=1, le=50)] = 20,
    ) -> NearbyFlights:
        """Aircraft currently near an airport, from open ADS-B networks (positions may be a
        minute or so old). Routes are as reported by community data and can be wrong."""
        airport = found(
            await db("airport", lambda c: airport_svc.get_airport(c, code, today_ist())),
            f"No airport with code {code.upper()} in AeroGuide.",
        )
        positions = await position_svc.get_positions(get_resources().live)
        nearby = sorted(
            (
                NearbyFlight(
                    distance_km=round(haversine_km(airport.lat, airport.lon, lat, lon), 1),
                    lat=lat,
                    lon=lon,
                    aircraft=f.properties,
                )
                for f in positions.features
                for lon, lat in [f.geometry.coordinates]
            ),
            key=lambda n: n.distance_km,
        )
        in_radius = [n for n in nearby if n.distance_km <= radius_km]
        return NearbyFlights(
            airport=airport.iata,
            radius_km=radius_km,
            flights=in_radius[:limit],
            total_in_radius=len(in_radius),
            meta=positions.meta,
        )

    @mcp.tool(title="Flight details", annotations=LIVE)
    async def get_flight(
        icao24: Annotated[
            str, Field(pattern=r"^[0-9a-fA-F]{6}$", description="Aircraft hex id, from flights")
        ],
    ) -> AircraftDetail:
        """One tracked aircraft: live position, reported route and progress along it."""
        detail = await position_svc.get_aircraft(get_resources().live, icao24)
        return found(detail, "That aircraft isn't being tracked right now.")

    register_fare_tools(mcp, get_resources, settings)
    return mcp
