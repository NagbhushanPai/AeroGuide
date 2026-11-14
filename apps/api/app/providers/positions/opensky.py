"""OpenSky Network REST API (non-commercial use; fallback source)."""

import time
from collections.abc import Callable
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


TOKEN_URL = (  # a public endpoint, not a credential
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"  # noqa: S105
)
STATES_URL = "https://opensky-network.org/api/states/all"
# Refresh this long before the token says it expires (tokens last 30 minutes).
TOKEN_MARGIN_S = 60.0


class OpenSkyProvider:
    """With an API client (OAuth2 client credentials) OpenSky gives a registered account's
    4,000 daily credits, tied to the account. Without one, it falls back to anonymous access:
    400 credits a day per IP, shared with everyone else behind the same address."""

    name = "OpenSky Network"
    url = "https://opensky-network.org"
    attribution = "Flight data © The OpenSky Network"
    is_demo = False

    def __init__(
        self,
        client: httpx.AsyncClient,
        client_id: str | None = None,
        client_secret: str | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self._credentials = (client_id, client_secret) if client_id and client_secret else None
        self._clock = clock
        self._token: str | None = None
        self._token_expires = 0.0

    async def _bearer(self, *, renew: bool = False) -> dict[str, str]:
        if self._credentials is None:
            return {}
        if renew or self._token is None or self._clock() >= self._token_expires:
            client_id, client_secret = self._credentials
            r = await self._client.post(
                TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
            r.raise_for_status()
            body = r.json()
            self._token = str(body["access_token"])
            lifetime = float(body.get("expires_in", 1800))
            self._token_expires = self._clock() + max(lifetime - TOKEN_MARGIN_S, 0.0)
        return {"Authorization": f"Bearer {self._token}"}

    async def fetch(self) -> list[AircraftState]:
        r = await self._client.get(STATES_URL, params=INDIA_BBOX, headers=await self._bearer())
        if r.status_code == 401 and self._credentials is not None:  # token revoked or expired
            r = await self._client.get(
                STATES_URL, params=INDIA_BBOX, headers=await self._bearer(renew=True)
            )
        if r.status_code == 429:  # daily credits used up
            retry = r.headers.get("X-Rate-Limit-Retry-After-Seconds", "")
            raise ProviderRateLimitedError(self.name, float(retry) if retry.isdigit() else 3600.0)
        r.raise_for_status()
        states = r.json().get("states") or []
        return [a for a in (normalise(s) for s in states) if a is not None]
