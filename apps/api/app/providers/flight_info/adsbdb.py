"""adsbdb.com community callsign → route lookups. Results are 'reported routes', not schedules."""

from typing import Any

import httpx

from app.schemas.positions import ReportedRoute, RouteAirport


class RouteLookupError(Exception):
    """The lookup itself failed (network or server). Distinct from 'no route known'."""


def _airport(a: dict[str, Any] | None) -> RouteAirport | None:
    if not a or a.get("latitude") is None or a.get("longitude") is None:
        return None
    return RouteAirport(
        iata=a.get("iata_code"),
        icao=a.get("icao_code"),
        name=a.get("name"),
        city=a.get("municipality"),
        country=a.get("country_name"),
        lat=a["latitude"],
        lon=a["longitude"],
    )


def parse(callsign: str, body: dict[str, Any]) -> ReportedRoute | None:
    # Unknown callsigns come back as {"response": "unknown callsign"} (a string, not an object).
    response = body.get("response") if isinstance(body, dict) else None
    fr = response.get("flightroute") if isinstance(response, dict) else None
    if not isinstance(fr, dict):
        return None
    origin, destination = _airport(fr.get("origin")), _airport(fr.get("destination"))
    if origin is None or destination is None:
        return None
    airline = fr.get("airline") or {}
    return ReportedRoute(
        callsign=callsign,
        flight_number=fr.get("callsign_iata"),
        airline_name=airline.get("name"),
        airline_iata=airline.get("iata"),
        origin=origin,
        destination=destination,
        source="adsbdb (community data)",
        source_url="https://www.adsbdb.com",
    )


class AdsbdbRoutes:
    name = "adsbdb"

    def __init__(self, client: httpx.AsyncClient, base_url: str = "https://api.adsbdb.com") -> None:
        self._client = client
        self._base = base_url.rstrip("/")

    async def route_for_callsign(self, callsign: str) -> ReportedRoute | None:
        try:
            r = await self._client.get(f"{self._base}/v0/callsign/{callsign}")
        except httpx.HTTPError as exc:
            raise RouteLookupError(str(exc)) from exc
        if r.status_code == 404:
            return None  # unknown callsign: a real answer, cached as "no route"
        if r.status_code >= 400:
            raise RouteLookupError(f"HTTP {r.status_code}")
        try:
            return parse(callsign, r.json())
        except ValueError as exc:
            raise RouteLookupError("invalid JSON") from exc
