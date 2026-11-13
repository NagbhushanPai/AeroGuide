"""Airport search and detail queries (read-only)."""

from datetime import date, timedelta
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import Select, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.orm import aliased

from app.core.india import Region
from app.models import Airline, Airport, Source, Terminal, TerminalAirline
from app.models.enums import VerificationStatus
from app.schemas.airports import (
    AirlineRef,
    AirportDetail,
    AirportList,
    AirportSummary,
    DisplayStatus,
    Provenance,
    SourceRef,
    TerminalAirlineOut,
    TerminalOut,
)

TERMINAL_NOTE = (
    "Terminal assignments change. Always confirm the terminal on your boarding pass or with "
    "your airline before you travel."
)
# Below this pg_trgm similarity a name is too different to be a typo of the query.
FUZZY_THRESHOLD = 0.3


def display_status(
    status: VerificationStatus, verified_at: date | None, reverify_after_days: int, today: date
) -> DisplayStatus:
    if status is VerificationStatus.VERIFIED:
        if verified_at is not None and (today - verified_at).days > reverify_after_days:
            return "outdated"
        return "verified"
    return status.value  # type: ignore[return-value]


def _geom(col: Any) -> Any:
    return cast(col, Geometry)


SUMMARY_COLUMNS = (
    Airport.iata,
    Airport.icao,
    Airport.name,
    Airport.city,
    Airport.state,
    Airport.region,
    func.ST_Y(_geom(Airport.location)).label("lat"),
    func.ST_X(_geom(Airport.location)).label("lon"),
    Airport.size,
    Airport.has_guide,
    Airport.verification_status,
    Airport.verified_at,
    Airport.reverify_after_days,
)


def _summary(row: Any, today: date) -> AirportSummary:
    return AirportSummary(
        iata=row.iata,
        icao=row.icao,
        name=row.name,
        city=row.city,
        state=row.state,
        region=Region(row.region),
        lat=round(row.lat, 5),
        lon=round(row.lon, 5),
        size=row.size,
        has_guide=row.has_guide,
        status=display_status(
            row.verification_status, row.verified_at, row.reverify_after_days, today
        ),
    )


def _escape_like(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search_filter(q: str) -> tuple[Any, list[Any]]:
    """WHERE clause and ranking for a free-text query over codes, name, city and state."""
    code = q.upper()
    like = f"%{_escape_like(q)}%"
    prefix = f"{_escape_like(q)}%"
    city = func.coalesce(Airport.city, "")
    state = func.coalesce(Airport.state, "")
    similarity = func.greatest(func.similarity(Airport.name, q), func.similarity(city, q))
    where = or_(
        Airport.iata == code,
        Airport.icao == code,
        Airport.name.ilike(like, escape="\\"),
        city.ilike(like, escape="\\"),
        state.ilike(like, escape="\\"),
        similarity > FUZZY_THRESHOLD,
    )
    rank = [
        case((Airport.iata == code, 0), (Airport.icao == code, 1), else_=2),
        case(
            (or_(city.ilike(prefix, escape="\\"), Airport.name.ilike(prefix, escape="\\")), 0),
            else_=1,
        ),
        similarity.desc(),
    ]
    return where, rank


SIZE_ORDER = case((Airport.size == "large", 0), (Airport.size == "medium", 1), else_=2)


async def search_airports(
    conn: AsyncConnection,
    *,
    q: str | None,
    region: Region | None,
    guides_only: bool,
    limit: int,
    offset: int,
    today: date,
) -> AirportList:
    filters: list[Any] = []
    rank: list[Any] = []
    if q:
        where, rank = _search_filter(q)
        filters.append(where)
    if region is not None:
        filters.append(Airport.region == region.value)
    if guides_only:
        filters.append(Airport.has_guide.is_(True))
    condition = and_(True, *filters)

    stmt: Select[Any] = (
        select(*SUMMARY_COLUMNS)
        .where(condition)
        .order_by(*rank, Airport.has_guide.desc(), SIZE_ORDER, Airport.name)
        .limit(limit)
        .offset(offset)
    )
    rows = (await conn.execute(stmt)).all()
    total = (
        await conn.execute(select(func.count()).select_from(Airport).where(condition))
    ).scalar_one()
    return AirportList(
        items=[_summary(r, today) for r in rows], total=total, limit=limit, offset=offset
    )


def _source(row: Any, prefix: str) -> SourceRef | None:
    if getattr(row, f"{prefix}name") is None:
        return None
    return SourceRef(
        name=getattr(row, f"{prefix}name"),
        url=getattr(row, f"{prefix}url"),
        publisher=getattr(row, f"{prefix}publisher"),
        source_type=getattr(row, f"{prefix}source_type"),
        retrieved_at=getattr(row, f"{prefix}retrieved_at"),
    )


def _source_columns(alias: Any, prefix: str) -> list[Any]:
    return [
        alias.name.label(f"{prefix}name"),
        alias.url.label(f"{prefix}url"),
        alias.publisher.label(f"{prefix}publisher"),
        alias.source_type.label(f"{prefix}source_type"),
        alias.retrieved_at.label(f"{prefix}retrieved_at"),
    ]


def _provenance(row: Any, today: date, prefix: str = "") -> Provenance:
    status = getattr(row, f"{prefix}verification_status")
    verified_at = getattr(row, f"{prefix}verified_at")
    days = getattr(row, f"{prefix}reverify_after_days")
    return Provenance(
        status=display_status(status, verified_at, days, today),
        verified_at=verified_at,
        reverify_due=verified_at + timedelta(days=days)
        if status is VerificationStatus.VERIFIED and verified_at
        else None,
        source=_source(row, f"{prefix}src_"),
        notes=getattr(row, f"{prefix}notes"),
    )


async def get_airport(conn: AsyncConnection, code: str, today: date) -> AirportDetail | None:
    """Look up by IATA (3 letters) or ICAO (4 letters)."""
    code = code.upper()
    primary = aliased(Source)
    official = aliased(Source)
    stmt = (
        select(
            *SUMMARY_COLUMNS,
            Airport.id,
            Airport.elevation_ft,
            Airport.timezone,
            Airport.notes,
            *_source_columns(primary, "src_"),
            *_source_columns(official, "off_"),
        )
        .outerjoin(primary, primary.id == Airport.primary_source_id)
        .outerjoin(official, official.id == Airport.official_source_id)
        .where(Airport.iata == code if len(code) == 3 else Airport.icao == code)
    )
    row = (await conn.execute(stmt)).one_or_none()
    if row is None:
        return None

    tsrc = aliased(Source)
    terminals = (
        await conn.execute(
            select(
                Terminal.id,
                Terminal.code,
                Terminal.name,
                Terminal.role,
                Terminal.verification_status,
                Terminal.verified_at,
                Terminal.reverify_after_days,
                Terminal.notes,
                *_source_columns(tsrc, "src_"),
            )
            .outerjoin(tsrc, tsrc.id == Terminal.primary_source_id)
            .where(Terminal.airport_id == row.id)
            .order_by(Terminal.code)
        )
    ).all()

    asrc = aliased(Source)
    assignments = (
        await conn.execute(
            select(
                TerminalAirline.terminal_id,
                TerminalAirline.operation,
                TerminalAirline.scope_note,
                TerminalAirline.valid_from,
                TerminalAirline.valid_to,
                TerminalAirline.verification_status,
                TerminalAirline.verified_at,
                TerminalAirline.reverify_after_days,
                TerminalAirline.notes,
                Airline.icao.label("airline_icao"),
                Airline.iata.label("airline_iata"),
                Airline.name.label("airline_name"),
                *_source_columns(asrc, "src_"),
            )
            .join(Airline, Airline.id == TerminalAirline.airline_id)
            .outerjoin(asrc, asrc.id == TerminalAirline.primary_source_id)
            .where(TerminalAirline.terminal_id.in_([t.id for t in terminals]))
            # Current assignments only: valid_to is exclusive.
            .where(or_(TerminalAirline.valid_to.is_(None), TerminalAirline.valid_to > today))
            .where(TerminalAirline.valid_from <= today)
            .order_by(Airline.name)
        )
    ).all()

    summary = _summary(row, today)
    return AirportDetail(
        **summary.model_dump(),
        elevation_ft=row.elevation_ft,
        timezone=row.timezone,
        official_source=_source(row, "off_"),
        provenance=_provenance(row, today),
        terminals=[
            TerminalOut(
                code=t.code,
                name=t.name,
                role=t.role,
                provenance=_provenance(t, today),
                airlines=[
                    TerminalAirlineOut(
                        airline=AirlineRef(
                            icao=a.airline_icao, iata=a.airline_iata, name=a.airline_name
                        ),
                        operation=a.operation,
                        scope_note=a.scope_note,
                        valid_from=a.valid_from,
                        valid_to=a.valid_to,
                        provenance=_provenance(a, today),
                    )
                    for a in assignments
                    if a.terminal_id == t.id
                ],
            )
            for t in terminals
        ],
        terminal_note=TERMINAL_NOTE,
    )
