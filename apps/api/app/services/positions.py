"""Live positions service: snapshot → API contract. Framework-agnostic (ADR-0008)."""

from datetime import UTC, datetime, timedelta

from app.core.geo import angle_between, bearing_deg, haversine_km
from app.ingestion.live import LiveService, Snapshot
from app.schemas.positions import (
    AircraftDetail,
    AircraftFeature,
    AircraftProperties,
    AircraftState,
    LiveMode,
    PointGeometry,
    PositionsMeta,
    PositionsResponse,
    ReportedRoute,
    RouteProgress,
)

# Sweeps run once a minute, so positions are normally 0-70 s old. 90 s is the live threshold.
LIVE_MAX_AGE = timedelta(seconds=90)
DEGRADED_MAX_AGE = timedelta(minutes=5)
KT_TO_KMH = 1.852

BBox = tuple[float, float, float, float]  # min_lon, min_lat, max_lon, max_lat


RETRYING = " AeroGuide keeps trying every minute, and the map updates on its own."


def outage_reason(last_error: str | None) -> str:
    """Why the latest sweeps failed, in plain words (from LiveService.last_error)."""
    if not last_error:
        return "The open data sources didn't respond."
    parts = [p for p in last_error.split(";") if p.strip()]
    if parts and all("rate-limited" in p or "resting" in p for p in parts):
        return "The open data sources are busy right now (they're limiting requests)."
    return "The open data sources aren't responding right now."


def build_meta(
    snap: Snapshot | None, now: datetime, last_error: str | None = None
) -> PositionsMeta:
    """Mode follows docs/architecture/flight-data-flow.md. `count` is filled in by callers."""
    if snap is None:
        return PositionsMeta(
            mode="unavailable",
            source=None,
            source_url=None,
            attribution=None,
            fetched_at=None,
            generated_at=now,
            count=0,
            message="Live flight data is unavailable. " + outage_reason(last_error) + RETRYING,
        )

    mode: LiveMode
    age = now - snap.fetched_at
    if age > DEGRADED_MAX_AGE:
        mode, message = (
            "unavailable",
            "The last live data is more than 5 minutes old, so it isn't shown. "
            + outage_reason(last_error)
            + RETRYING,
        )
    elif snap.source.is_demo:
        mode, message = "demo", "Simulated aircraft for testing. These are not real flights."
    elif age > LIVE_MAX_AGE:
        mode, message = "degraded", "Live data is delayed. Positions may be out of date."
    else:
        mode, message = "live", None

    return PositionsMeta(
        mode=mode,
        source=snap.source.name,
        source_url=snap.source.url,
        attribution=snap.source.attribution,
        fetched_at=snap.fetched_at,
        generated_at=now,
        count=0,
        message=message,
    )


def route_is_plausible(state: AircraftState, route: ReportedRoute) -> bool:
    """Reject a reported route the aircraft is clearly not flying (stale community data)."""
    if state.on_ground or state.track_deg is None:
        return True
    dest = route.destination
    if haversine_km(state.lat, state.lon, dest.lat, dest.lon) < 50:
        return True
    to_dest = bearing_deg(state.lat, state.lon, dest.lat, dest.lon)
    return angle_between(state.track_deg, to_dest) <= 100


def _in_bbox(a: AircraftState, bbox: BBox | None) -> bool:
    if bbox is None:
        return True
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lat <= a.lat <= max_lat and min_lon <= a.lon <= max_lon


async def get_positions(live: LiveService, bbox: BBox | None = None) -> PositionsResponse:
    snap = await live.snapshot()
    now = datetime.now(UTC)
    meta = build_meta(snap, now, live.last_error)
    if snap is None or meta.mode == "unavailable":
        return PositionsResponse(features=[], meta=meta)

    features = []
    for a in snap.aircraft:
        if not _in_bbox(a, bbox):
            continue
        route = live.cached_route(a.callsign)
        if route is not None and not route_is_plausible(a, route):
            route = None
        features.append(
            AircraftFeature(
                id=a.icao24,
                geometry=PointGeometry(coordinates=(a.lon, a.lat)),
                properties=AircraftProperties(
                    icao24=a.icao24,
                    callsign=a.callsign,
                    registration=a.registration,
                    type_code=a.type_code,
                    alt_baro_ft=a.alt_baro_ft,
                    on_ground=a.on_ground,
                    gs_kt=a.gs_kt,
                    track_deg=a.track_deg,
                    vrate_fpm=a.vrate_fpm,
                    position_time=a.position_time,
                    is_demo=a.is_demo,
                    origin_iata=route.origin.iata if route else None,
                    destination_iata=route.destination.iata if route else None,
                    flight_number=route.flight_number if route else None,
                ),
            )
        )
    meta.count = len(features)
    return PositionsResponse(features=features, meta=meta)


def compute_progress(state: AircraftState, route: ReportedRoute, now: datetime) -> RouteProgress:
    o, d = route.origin, route.destination
    flown = haversine_km(o.lat, o.lon, state.lat, state.lon)
    remaining = haversine_km(state.lat, state.lon, d.lat, d.lon)
    total = flown + remaining
    percent = 0.0 if total == 0 else round(100 * flown / total, 1)
    minutes = eta = None
    if not state.on_ground and state.gs_kt and state.gs_kt > 60:
        minutes = round(remaining / (state.gs_kt * KT_TO_KMH) * 60, 1)
        eta = now + timedelta(minutes=minutes)
    return RouteProgress(
        flown_km=round(flown, 1),
        remaining_km=round(remaining, 1),
        percent=percent,
        estimated_arrival=eta,
        minutes_remaining=minutes,
    )


async def get_aircraft(live: LiveService, icao24: str) -> AircraftDetail | None:
    snap = await live.snapshot()
    now = datetime.now(UTC)
    meta = build_meta(snap, now, live.last_error)
    if snap is None or meta.mode == "unavailable":
        return None
    state = snap.by_icao.get(icao24.lower())
    if state is None:
        return None
    meta.count = 1

    route = await live.route(state.callsign)
    note: str | None = None
    if not state.callsign:
        note = "This aircraft isn't broadcasting a callsign, so its route can't be looked up."
    elif route is None:
        note = "No reported route is available for this callsign."
    elif not route_is_plausible(state, route):
        route, note = (
            None,
            "The reported route doesn't match this aircraft's heading, so it's hidden.",
        )

    progress = compute_progress(state, route, now) if route else None
    return AircraftDetail(
        aircraft=state, reported_route=route, route_note=note, progress=progress, meta=meta
    )
