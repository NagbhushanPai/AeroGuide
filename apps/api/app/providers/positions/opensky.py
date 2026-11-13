"""OpenSky Network REST API (non-commercial use; fallback source)."""

from datetime import UTC, datetime
from typing import Any

import httpx

from app.providers.positions.base import INDIA_BBOX, ProviderRateLimitedError
from app.schemas.positions import AircraftState

M_TO_FT = 3.28084
MS_TO_KT = 1.943844
MS_TO_FPM = 196.8504


def normalise(s: list[Any]) -> AircraftState | None:
    # https://openskynetwork.github.io/opensky-api/rest.html#response
    lon, lat = s[5], s[6]
    if lat is None or lon is None:
        return None
    t = s[3] or s[4]
    on_ground = bool(s[8])
    return AircraftState(
        icao24=str(s[0]).lower(),
        lat=lat,
        lon=lon,
        position_time=datetime.fromtimestamp(t, UTC) if t else datetime.now(UTC),
        callsign=(s[1] or "").strip() or None,
        alt_baro_ft=None if on_ground or s[7] is None else round(s[7] * M_TO_FT),
        on_ground=on_ground,
        gs_kt=None if s[9] is None else round(s[9] * MS_TO_KT, 1),
        track_deg=s[10],
        vrate_fpm=None if s[11] is None else round(s[11] * MS_TO_FPM),
        squawk=s[14] or None,
        source="OpenSky Network",
    )


class OpenSkyProvider:
    name = "OpenSky Network"
    url = "https://opensky-network.org"
    attribution = "Flight data © The OpenSky Network"
    is_demo = False

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def fetch(self) -> list[AircraftState]:
        r = await self._client.get("https://opensky-network.org/api/states/all", params=INDIA_BBOX)
        if r.status_code == 429:  # daily credits used up
            retry = r.headers.get("X-Rate-Limit-Retry-After-Seconds", "")
            raise ProviderRateLimitedError(self.name, float(retry) if retry.isdigit() else 3600.0)
        r.raise_for_status()
        states = r.json().get("states") or []
        return [a for a in (normalise(s) for s in states) if a is not None]
