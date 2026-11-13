"""adsb.lol community ADS-B network. Data under ODbL 1.0 (attribution shown in the UI)."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.providers.positions.base import ProviderRateLimitedError, in_coverage
from app.schemas.positions import AircraftState

# adsb.lol allows 10 requests per rolling minute (observed 2026-11-13: the 11th gets 429 with
# Retry-After), so one sweep is exactly 10 point queries, once a minute. Each covers the API's
# maximum 250 nm radius. Together they cover every Indian airport with scheduled service except
# the island airports Agatti (AGX) and Port Blair (IXZ).
GRID: tuple[tuple[float, float], ...] = (
    (30.5, 75.5), (26.5, 70.5), (26.0, 79.0), (25.5, 86.5), (25.5, 93.0),
    (20.5, 73.0), (20.0, 80.5), (20.5, 87.5), (14.5, 76.0), (10.5, 78.5),
)  # fmt: skip
RADIUS_NM = 250
# One request at a time, 1 s apart: the API throttles bursts (429 with a short Retry-After).
REQUEST_SPACING_S = 1.0
DEFAULT_RETRY_AFTER_S = 120.0


def normalise(raw: dict[str, Any], now: datetime) -> AircraftState | None:
    lat, lon = raw.get("lat"), raw.get("lon")
    if lat is None or lon is None or not in_coverage(lat, lon):
        return None
    alt = raw.get("alt_baro")
    on_ground = alt == "ground"
    seen_pos = raw.get("seen_pos", raw.get("seen", 0)) or 0
    return AircraftState(
        icao24=str(raw["hex"]).lower().lstrip("~"),
        lat=lat,
        lon=lon,
        position_time=now - timedelta(seconds=float(seen_pos)),
        callsign=(raw.get("flight") or "").strip() or None,
        registration=raw.get("r") or None,
        type_code=raw.get("t") or None,
        alt_baro_ft=None if on_ground or not isinstance(alt, int | float) else int(alt),
        on_ground=on_ground,
        gs_kt=raw.get("gs"),
        track_deg=raw.get("track", raw.get("true_heading")),
        vrate_fpm=raw.get("baro_rate", raw.get("geom_rate")),
        squawk=raw.get("squawk") or None,
        source="adsb.lol",
    )


class AdsbLolProvider:
    name = "adsb.lol"
    url = "https://adsb.lol"
    attribution = "Flight data © adsb.lol contributors (ODbL)"
    is_demo = False

    def __init__(
        self,
        client: httpx.AsyncClient,
        base_url: str = "https://api.adsb.lol",
        spacing_s: float = REQUEST_SPACING_S,
    ) -> None:
        self._client = client
        self._base = base_url.rstrip("/")
        self._spacing = spacing_s

    async def _point(self, lat: float, lon: float) -> list[Any] | None:
        try:
            r = await self._client.get(f"{self._base}/v2/point/{lat}/{lon}/{RADIUS_NM}")
        except httpx.HTTPError:
            return None
        if r.status_code == 429:
            retry = r.headers.get("Retry-After", "")
            raise ProviderRateLimitedError(
                self.name, float(retry) if retry.isdigit() else DEFAULT_RETRY_AFTER_S
            )
        if r.status_code >= 400:
            return None
        try:
            ac: list[Any] = r.json().get("ac") or []
        except ValueError:
            return None
        return ac

    async def fetch(self) -> list[AircraftState]:
        # A 429 on any point aborts the sweep: partial coverage would silently hide regions.
        results: list[list[Any] | None] = []
        for i, (lat, lon) in enumerate(GRID):
            if i and self._spacing:
                await asyncio.sleep(self._spacing)
            results.append(await self._point(lat, lon))
        if all(r is None for r in results):
            raise RuntimeError("adsb.lol: every point query failed")
        now = datetime.now(UTC)
        by_hex: dict[str, AircraftState] = {}
        for batch in results:
            for raw in batch or []:
                state = normalise(raw, now)
                if state is not None:
                    by_hex[state.icao24] = state
        return list(by_hex.values())
