"""Airline sightings at airports, from the live ADS-B snapshot.

After each live sweep, aircraft that are on the ground, or low (≤ MAX_ALT_FT) within RADIUS_KM
of an airport's reference point, and whose callsign starts with an airline ICAO code
(three letters, then a digit, for example IGO6123), are recorded once per aircraft, airline,
airport and IST day.

This is an observation of community ADS-B data while AeroGuide's live service was running.
It is not a schedule, it says nothing about terminals, and coverage has gaps (the free API
sleeps when idle, and receivers don't cover every airport).

Rows are buffered in memory and written at most every `flush_interval_s`, so the free
database tier isn't hit on every sweep. Rows older than RETENTION_DAYS are deleted.
"""

import logging
import re
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from geoalchemy2 import Geometry
from sqlalchemy import cast, delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.geo import haversine_km
from app.core.india import IST
from app.models import Airport, AirportSighting
from app.schemas.positions import AircraftState

if TYPE_CHECKING:
    from app.ingestion.live import LiveService, Snapshot

logger = logging.getLogger(__name__)

RADIUS_KM = 6.0
MAX_ALT_FT = 3000  # above the airport's elevation
RETENTION_DAYS = 45
# If the database is down for a long time, stop buffering new keys rather than grow forever.
MAX_PENDING = 20_000
INSERT_CHUNK = 1_000  # 9 columns per row, well under Postgres's 32,767 parameter limit
AIRLINE_CALLSIGN = re.compile(r"^([A-Z]{3})[0-9][0-9A-Z]{0,4}$")


@dataclass(frozen=True, slots=True)
class AirportPoint:
    id: uuid.UUID
    iata: str
    lat: float
    lon: float
    elevation_ft: int | None = None  # None = unknown, treated as sea level


@dataclass(slots=True)
class Pending:
    airline_name: str | None
    callsign: str
    first_seen: datetime
    last_seen: datetime
    source: str


def airline_icao(callsign: str | None) -> str | None:
    """'IGO6123' -> 'IGO'. None for registrations, military and other non-airline callsigns."""
    if not callsign:
        return None
    m = AIRLINE_CALLSIGN.match(callsign.strip().upper())
    return m.group(1) if m else None


def near_airport(a: AircraftState, airports: list[AirportPoint]) -> AirportPoint | None:
    """The nearest airport within RADIUS_KM, if the aircraft is on the ground or low.

    "Low" is height above the airport (barometric altitude minus field elevation), so plateau
    airports such as Bengaluru (about 3,000 ft) or Leh (about 10,700 ft) aren't missed."""
    if not a.on_ground and a.alt_baro_ft is None:
        return None
    best: tuple[float, AirportPoint] | None = None
    for ap in airports:
        # Cheap box test first: 0.1° is about 11 km.
        if abs(ap.lat - a.lat) > 0.1 or abs(ap.lon - a.lon) > 0.1:
            continue
        too_high = (
            not a.on_ground
            and a.alt_baro_ft is not None
            and a.alt_baro_ft - (ap.elevation_ft or 0) > MAX_ALT_FT
        )
        if too_high:
            continue
        d = haversine_km(a.lat, a.lon, ap.lat, ap.lon)
        if d <= RADIUS_KM and (best is None or d < best[0]):
            best = (d, ap)
    return best[1] if best else None


class SightingRecorder:
    def __init__(
        self,
        engine: AsyncEngine,
        *,
        flush_interval_s: float = 300.0,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._engine = engine
        self._flush_interval = flush_interval_s
        self._monotonic = monotonic
        self._airports: list[AirportPoint] | None = None
        self._pending: dict[tuple[uuid.UUID, str, str, date], Pending] = {}
        self._last_flush = monotonic()
        self._last_prune: date | None = None

    async def _load_airports(self) -> list[AirportPoint]:
        if self._airports is None:
            geom = cast(Airport.location, Geometry)
            async with self._engine.connect() as conn:
                rows = (
                    await conn.execute(
                        select(
                            Airport.id,
                            Airport.iata,
                            func.ST_Y(geom),
                            func.ST_X(geom),
                            Airport.elevation_ft,
                        )
                    )
                ).all()
            self._airports = [
                AirportPoint(r[0], r[1], float(r[2]), float(r[3]), r[4]) for r in rows
            ]
        return self._airports

    def collect(
        self, snapshot: "Snapshot", airports: list[AirportPoint], live: "LiveService | None"
    ) -> int:
        """Buffer sightings from one snapshot. Returns how many aircraft matched."""
        matched = 0
        day = snapshot.fetched_at.astimezone(IST).date()
        for a in snapshot.aircraft:
            airline = airline_icao(a.callsign)
            if airline is None:
                continue
            ap = near_airport(a, airports)
            if ap is None:
                continue
            matched += 1
            route = live.cached_route(a.callsign) if live else None
            name = route.airline_name if route else None
            key = (ap.id, airline, a.icao24, day)
            seen = a.position_time
            hit = self._pending.get(key)
            if hit is None:
                if len(self._pending) >= MAX_PENDING:
                    continue
                self._pending[key] = Pending(
                    name, a.callsign or "", seen, seen, snapshot.source.name
                )
            else:
                hit.last_seen = max(hit.last_seen, seen)
                hit.first_seen = min(hit.first_seen, seen)
                hit.airline_name = hit.airline_name or name
        return matched

    async def __call__(self, snapshot: "Snapshot", live: "LiveService") -> None:
        """LiveService observer: collect, then flush when due."""
        try:
            airports = await self._load_airports()
        except Exception as exc:  # database unavailable: try again next sweep
            logger.info("sightings: airports not loaded: %s", type(exc).__name__)
            return
        self.collect(snapshot, airports, live)
        if self._monotonic() - self._last_flush >= self._flush_interval:
            await self.flush()

    async def flush(self) -> int:
        """Write buffered sightings. On failure they stay buffered for the next attempt."""
        self._last_flush = self._monotonic()
        if not self._pending:
            return 0
        rows: list[dict[str, Any]] = [
            {
                "airport_id": k[0],
                "airline_icao": k[1],
                "icao24": k[2],
                "service_date": k[3],
                "airline_name": p.airline_name,
                "callsign": p.callsign,
                "first_seen": p.first_seen,
                "last_seen": p.last_seen,
                "source": p.source,
            }
            for k, p in self._pending.items()
        ]
        today = datetime.now(IST).date()
        async with self._engine.begin() as conn:
            for i in range(0, len(rows), INSERT_CHUNK):
                stmt = insert(AirportSighting).values(rows[i : i + INSERT_CHUNK])
                await conn.execute(
                    stmt.on_conflict_do_update(
                        index_elements=["airport_id", "airline_icao", "icao24", "service_date"],
                        set_={
                            "last_seen": func.greatest(
                                AirportSighting.last_seen, stmt.excluded.last_seen
                            ),
                            "first_seen": func.least(
                                AirportSighting.first_seen, stmt.excluded.first_seen
                            ),
                            "airline_name": func.coalesce(
                                stmt.excluded.airline_name, AirportSighting.airline_name
                            ),
                        },
                    )
                )
            if self._last_prune != today:
                cutoff = today - timedelta(days=RETENTION_DAYS)
                await conn.execute(
                    delete(AirportSighting).where(AirportSighting.service_date < cutoff)
                )
                self._last_prune = today
        self._pending.clear()
        return len(rows)
