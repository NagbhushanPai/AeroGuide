"""Community ADS-B networks that share the readsb JSON format (adsb.lol, adsb.fi), and a pool
that uses them together with point-by-point failover.

Each sweep queries the same 10-point India grid. adsb.lol data is ODbL 1.0; adsb.fi is for
personal, non-commercial use with attribution. Both credits are shown in the UI."""

import asyncio
import time
from collections.abc import Awaitable, Callable
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
# More missing regions than this and the sweep fails, so a half-empty map is never shown as
# complete; the live service then tries the next source.
MAX_FAILED_POINTS = 2


def normalise(raw: dict[str, Any], now: datetime, source: str = "adsb.lol") -> AircraftState | None:
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
        source=source,
    )


class ReadsbGridProvider:
    """Sweeps GRID on one readsb-compatible network. Subclasses set the network details."""

    name: str
    url: str
    attribution: str
    is_demo = False
    default_base_url: str
    spacing_s: float = REQUEST_SPACING_S

    def __init__(
        self,
        client: httpx.AsyncClient,
        base_url: str | None = None,
        spacing_s: float | None = None,
    ) -> None:
        self._client = client
        self._base = (base_url or self.default_base_url).rstrip("/")
        self._spacing = self.spacing_s if spacing_s is None else spacing_s

    def point_path(self, lat: float, lon: float) -> str:
        raise NotImplementedError

    async def _point(self, lat: float, lon: float) -> list[Any] | None:
        try:
            r = await self._client.get(f"{self._base}{self.point_path(lat, lon)}")
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
        failed = sum(r is None for r in results)
        if failed > MAX_FAILED_POINTS:
            raise RuntimeError(f"{self.name}: {failed} of {len(GRID)} point queries failed")
        now = datetime.now(UTC)
        by_hex: dict[str, AircraftState] = {}
        for batch in results:
            for raw in batch or []:
                state = normalise(raw, now, self.name)
                if state is not None:
                    by_hex[state.icao24] = state
        return list(by_hex.values())


class AdsbLolProvider(ReadsbGridProvider):
    name = "adsb.lol"
    url = "https://adsb.lol"
    attribution = "Flight data © adsb.lol contributors (ODbL)"
    default_base_url = "https://api.adsb.lol"

    def point_path(self, lat: float, lon: float) -> str:
        return f"/v2/point/{lat}/{lon}/{RADIUS_NM}"


class AdsbFiProvider(ReadsbGridProvider):
    """adsb.fi open data: 1 request/second, personal non-commercial use, attribution required."""

    name = "adsb.fi"
    url = "https://adsb.fi"
    attribution = "Flight data from adsb.fi"
    default_base_url = "https://opendata.adsb.fi/api"
    spacing_s = 1.1

    def point_path(self, lat: float, lon: float) -> str:
        return f"/v3/lat/{lat}/lon/{lon}/dist/{RADIUS_NM}"


class ReadsbPool:
    """Several readsb networks (adsb.lol, adsb.fi) as one source, failing over point by point.

    Each grid point is asked of the network currently preferred. A 429 rests that network for
    its Retry-After and the remaining points go to the next one, so points already fetched are
    kept instead of starting the whole sweep again on another network. A point that fails for
    another reason is also tried on the next network. The pool sticks with whichever network
    last answered, so a busy network isn't asked first every minute.

    Rate limits are per network and often shared with other apps on the same host address, so
    spreading one sweep over two networks keeps the map live when either is busy.
    """

    is_demo = False

    def __init__(
        self,
        networks: list[ReadsbGridProvider],
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        if len(networks) < 2:
            raise ValueError("a pool needs at least two networks")
        self.networks = networks
        self.name = " + ".join(n.name for n in networks)
        self.url = networks[0].url
        self.attribution = "; ".join(n.attribution for n in networks)
        self._clock = clock
        self._sleep = sleep
        self._resting_until: dict[str, float] = {}
        self._last_request: dict[str, float] = {}
        self._preferred = 0

    def _available(self, broken: set[str]) -> list[ReadsbGridProvider]:
        now = self._clock()
        n = len(self.networks)
        order = [self.networks[(self._preferred + k) % n] for k in range(n)]
        return [
            net
            for net in order
            if net.name not in broken and self._resting_until.get(net.name, 0.0) <= now
        ]

    async def _ask(self, net: ReadsbGridProvider, lat: float, lon: float) -> list[Any] | None:
        last = self._last_request.get(net.name)
        if last is not None:
            wait = net._spacing - (self._clock() - last)
            if wait > 0:
                await self._sleep(wait)
        self._last_request[net.name] = self._clock()
        return await net._point(lat, lon)

    async def fetch(self) -> list[AircraftState]:
        results: list[tuple[str, list[Any]] | None] = []
        served: dict[str, int] = {}
        # A network that errors (not a rate limit) is skipped for the rest of this sweep, so
        # one that hangs can't make every remaining point wait for its timeout.
        broken: set[str] = set()
        for lat, lon in GRID:
            got: tuple[str, list[Any]] | None = None
            for net in self._available(broken):
                try:
                    batch = await self._ask(net, lat, lon)
                except ProviderRateLimitedError as exc:
                    self._resting_until[net.name] = self._clock() + exc.retry_after_s
                    continue
                if batch is None:
                    broken.add(net.name)
                    continue
                got = (net.name, batch)
                served[net.name] = served.get(net.name, 0) + 1
                break
            results.append(got)

        failed = sum(r is None for r in results)
        if failed > MAX_FAILED_POINTS:
            resting = [
                until - self._clock()
                for until in self._resting_until.values()
                if until > self._clock()
            ]
            if len(resting) == len(self.networks):
                raise ProviderRateLimitedError(self.name, min(resting))
            raise RuntimeError(f"{self.name}: {failed} of {len(GRID)} point queries failed")

        if served:  # stick with the network that answered most
            best = max(served, key=lambda name: served[name])
            self._preferred = next(i for i, n in enumerate(self.networks) if n.name == best)

        now = datetime.now(UTC)
        by_hex: dict[str, AircraftState] = {}
        for item in results:
            if item is None:
                continue
            network, batch = item
            for raw in batch:
                state = normalise(raw, now, network)  # each aircraft credits its own network
                if state is not None:
                    by_hex[state.icao24] = state
        return list(by_hex.values())

    def status(self) -> dict[str, float]:
        """Seconds each resting network has left, for /health."""
        now = self._clock()
        return {
            name: round(until - now) for name, until in self._resting_until.items() if until > now
        }
