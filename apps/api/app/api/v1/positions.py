from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response

from app.api.deps import AppResources, get_resources
from app.schemas.positions import AircraftDetail, PositionsResponse
from app.services.positions import BBox, get_aircraft, get_positions

router = APIRouter(prefix="/positions", tags=["positions"])


def parse_bbox(value: str | None) -> BBox | None:
    if value is None:
        return None
    try:
        min_lon, min_lat, max_lon, max_lat = (float(v) for v in value.split(","))
    except ValueError:
        raise HTTPException(422, "bbox must be min_lon,min_lat,max_lon,max_lat") from None
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise HTTPException(422, "bbox is out of range or inverted")
    return min_lon, min_lat, max_lon, max_lat


@router.get(
    "",
    response_model=PositionsResponse,
    summary="Latest aircraft positions",
    description=(
        "GeoJSON FeatureCollection of aircraft with `meta` (mode, source, attribution, "
        "fetched_at). Positions come from open ADS-B networks, fetched on demand."
    ),
)
async def positions(
    response: Response,
    resources: Annotated[AppResources, Depends(get_resources)],
    bbox: Annotated[str | None, Query(description="min_lon,min_lat,max_lon,max_lat")] = None,
) -> PositionsResponse:
    result = await get_positions(resources.live, parse_bbox(bbox))
    response.headers["Cache-Control"] = "public, max-age=5"
    return result


@router.get(
    "/{icao24}",
    response_model=AircraftDetail,
    summary="One aircraft with its reported route",
    responses={404: {"description": "Aircraft not currently tracked"}},
)
async def aircraft(
    resources: Annotated[AppResources, Depends(get_resources)],
    icao24: Annotated[str, Path(pattern=r"^[0-9a-fA-F]{6}$")],
) -> AircraftDetail:
    detail = await get_aircraft(resources.live, icao24)
    if detail is None:
        raise HTTPException(404, "This aircraft isn't currently tracked.")
    return detail
