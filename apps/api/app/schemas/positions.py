"""Live position contract (docs/architecture/flight-data-flow.md)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

LiveMode = Literal["live", "demo", "degraded", "unavailable"]


class AircraftState(BaseModel):
    """One aircraft's latest state, normalised from any source. Only identity, position and
    time are required: every other field is None when the source didn't report it."""

    icao24: str = Field(description="ICAO 24-bit address, lowercase hex")
    lat: float
    lon: float
    position_time: datetime
    callsign: str | None = None
    registration: str | None = None
    type_code: str | None = None
    alt_baro_ft: int | None = None
    on_ground: bool = False
    gs_kt: float | None = None
    track_deg: float | None = None
    vrate_fpm: int | None = None
    squawk: str | None = None
    source: str
    is_demo: bool = False


class RouteAirport(BaseModel):
    iata: str | None = None
    icao: str | None = None
    name: str | None = None
    city: str | None = None
    country: str | None = None
    lat: float
    lon: float


class ReportedRoute(BaseModel):
    """Origin/destination from community data. Never a verified schedule."""

    callsign: str
    flight_number: str | None = Field(default=None, description="IATA designator if known")
    airline_name: str | None = None
    airline_iata: str | None = None
    origin: RouteAirport
    destination: RouteAirport
    source: str
    source_url: str


class PositionsMeta(BaseModel):
    mode: LiveMode
    source: str | None
    source_url: str | None
    attribution: str | None
    fetched_at: datetime | None
    generated_at: datetime
    count: int
    message: str | None = Field(default=None, description="Human explanation when not live")


class AircraftProperties(BaseModel):
    icao24: str
    callsign: str | None
    registration: str | None
    type_code: str | None
    alt_baro_ft: int | None
    on_ground: bool
    gs_kt: float | None
    track_deg: float | None
    vrate_fpm: int | None
    position_time: datetime
    is_demo: bool
    origin_iata: str | None = Field(default=None, description="Reported route, when plausible")
    destination_iata: str | None = None
    flight_number: str | None = None


class PointGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]


class AircraftFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: PointGeometry
    properties: AircraftProperties


class PositionsResponse(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[AircraftFeature]
    meta: PositionsMeta


class RouteProgress(BaseModel):
    flown_km: float
    remaining_km: float
    percent: float
    estimated_arrival: datetime | None = Field(
        default=None, description="Estimated from live position and ground speed"
    )
    minutes_remaining: float | None = None


class AircraftDetail(BaseModel):
    aircraft: AircraftState
    reported_route: ReportedRoute | None
    route_note: str | None = Field(default=None, description="Why no route is shown")
    progress: RouteProgress | None
    meta: PositionsMeta
