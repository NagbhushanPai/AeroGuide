"""Synthetic aircraft for development and tests ONLY (ADR-0011).

Enabled only by explicit config (POSITION_PROVIDERS=demo). Never part of automatic failover.
Every aircraft is obviously fake: DEMO callsigns, DEMO- registrations, is_demo=True, and
fictional circular tracks.
"""

import math
from datetime import UTC, datetime

from app.schemas.positions import AircraftState

# (centre lat, centre lon, radius in degrees, period in seconds, altitude ft)
_TRACKS = (
    (28.0, 77.0, 1.5, 1800, 36000),
    (19.0, 73.5, 1.0, 1500, 28000),
    (13.0, 77.5, 1.2, 2100, 34000),
    (17.4, 78.5, 0.8, 1200, 12000),
    (22.6, 88.4, 1.4, 2400, 38000),
    (10.0, 76.3, 0.9, 1600, 24000),
)


class DemoProvider:
    name = "demo"
    url = "https://github.com/NagbhushanPai/AeroGuide"
    attribution = "Simulated aircraft (not real flights)"
    is_demo = True

    async def fetch(self) -> list[AircraftState]:
        now = datetime.now(UTC)
        t = now.timestamp()
        out = []
        for i, (clat, clon, radius, period, alt) in enumerate(_TRACKS):
            angle = (t % period) / period * 2 * math.pi
            lat = clat + radius * math.sin(angle)
            lon = clon + radius * math.cos(angle)
            # Clockwise motion: heading is perpendicular to the radius.
            track = (math.degrees(math.atan2(-math.sin(angle), math.cos(angle))) + 360) % 360
            speed_kt = 2 * math.pi * radius * 60 / (period / 3600)
            out.append(
                AircraftState(
                    icao24=f"de{i:04x}",
                    lat=lat,
                    lon=lon,
                    position_time=now,
                    callsign=f"DEMO{101 + i}",
                    registration=f"DEMO-{i + 1}",
                    type_code=None,
                    alt_baro_ft=alt,
                    gs_kt=round(speed_kt, 1),
                    track_deg=round(track, 1),
                    vrate_fpm=0,
                    source="demo",
                    is_demo=True,
                )
            )
        return out
