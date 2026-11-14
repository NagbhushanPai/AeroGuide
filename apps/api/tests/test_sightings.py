"""Airline sightings at airports (observed open data, never a schedule or terminal claim)."""

import asyncio
import importlib.util
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import delete

from app.core.config import get_settings
from app.database.session import create_engine
from app.ingestion.live import LiveService, Snapshot, SourceInfo
from app.ingestion.sightings import AirportPoint, SightingRecorder, airline_icao, near_airport
from app.models import AirportSighting
from app.schemas.positions import AircraftState
from app.seed.bundle import read_bundle
from app.seed.loader import apply_bundle
from tests.test_airports_api import make_client

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=UTC)  # 17:30 IST, same IST day
DEL = AirportPoint(uuid.uuid4(), "DEL", 28.55563, 77.09519)
GOX = AirportPoint(uuid.uuid4(), "GOX", 15.38, 73.83)
REPO = Path(__file__).resolve().parents[3]


def aircraft(**kw: object) -> AircraftState:
    base: dict[str, object] = dict(
        icao24="800abc",
        lat=28.56,
        lon=77.10,
        position_time=NOW,
        source="test",
        callsign="TST123",
        on_ground=True,
    )
    base.update(kw)
    return AircraftState.model_validate(base)


def snapshot(*planes: AircraftState, demo: bool = False) -> Snapshot:
    return Snapshot(list(planes), SourceInfo("test feed", "https://x", "attr", demo), NOW)


@pytest.mark.parametrize(
    ("callsign", "expected"),
    [
        ("IGO6123", "IGO"),
        ("AIC101 ", "AIC"),
        ("tst9", "TST"),
        ("VTABC", None),
        ("IAF", None),
        ("AB123", None),
        (None, None),
        ("ABCD123", None),
    ],
)
def test_airline_code_comes_from_the_callsign_prefix(
    callsign: str | None, expected: str | None
) -> None:
    assert airline_icao(callsign) == expected


def test_only_ground_or_low_aircraft_near_an_airport_match() -> None:
    airports = [DEL, GOX]
    assert near_airport(aircraft(), airports) == DEL
    assert near_airport(aircraft(on_ground=False, alt_baro_ft=2500), airports) == DEL
    assert near_airport(aircraft(on_ground=False, alt_baro_ft=8000), airports) is None
    assert near_airport(aircraft(on_ground=False, alt_baro_ft=None), airports) is None
    assert near_airport(aircraft(lat=28.70), airports) is None  # ~16 km away


def test_low_means_above_the_airport_not_above_sea_level() -> None:
    blr = AirportPoint(uuid.uuid4(), "BLR", 13.1986, 77.7066, elevation_ft=3000)
    final = aircraft(lat=13.21, lon=77.71, on_ground=False, alt_baro_ft=3500)  # ~500 ft up
    assert near_airport(final, [blr]) == blr
    assert (
        near_airport(aircraft(lat=13.21, lon=77.71, on_ground=False, alt_baro_ft=6500), [blr])
        is None
    )


def test_collect_counts_each_aircraft_once_per_day() -> None:
    rec = SightingRecorder(engine=None)  # type: ignore[arg-type]
    snap = snapshot(
        aircraft(),
        aircraft(),  # same aircraft again
        aircraft(icao24="800abd"),
        aircraft(icao24="800abe", callsign="VTABC"),  # not an airline callsign
        aircraft(icao24="800abf", lat=20.0),  # not near an airport
    )
    assert rec.collect(snap, [DEL], None) == 3
    assert len(rec._pending) == 2


async def test_observer_failures_never_break_the_live_snapshot() -> None:
    class Provider:
        name, url, attribution, is_demo = "p", "https://x", "attr", False

        async def fetch(self) -> list[AircraftState]:
            return [aircraft()]

    calls: list[int] = []

    async def broken(snap: Snapshot, live: LiveService) -> None:
        calls.append(len(snap.aircraft))
        raise RuntimeError("database down")

    live = LiveService([Provider()], None, None, on_snapshot=broken)
    snap = await live.snapshot()
    await asyncio.sleep(0.01)
    assert snap is not None and calls == [1]
    await live.aclose()


async def test_demo_snapshots_are_not_observed() -> None:
    calls: list[int] = []

    async def observer(snap: Snapshot, live: LiveService) -> None:
        calls.append(1)

    from app.providers.positions.demo import DemoProvider

    live = LiveService([DemoProvider()], None, None, on_snapshot=observer)
    await live.snapshot()
    await asyncio.sleep(0.01)
    assert calls == []
    await live.aclose()


def test_osm_terminal_selection_rules() -> None:
    spec = importlib.util.spec_from_file_location("osm", REPO / "scripts/build_osm_terminals.py")
    assert spec and spec.loader
    osm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(osm)
    aero = {"type": "way", "id": 1, "tags": {"aeroway": "aerodrome", "iata": "DEL"}}

    def term(kind: str, ident: int, name: str | None) -> dict[str, object]:
        tags = {"aeroway": "terminal", **({"name": name} if name else {})}
        return {"type": kind, "id": ident, "tags": tags, "center": {"lat": 28.5, "lon": 77.1}}

    rows = osm.select(
        [
            aero,
            term("way", 2, "Terminal 3"),
            term("relation", 3, "Terminal 3"),  # same name: the relation wins
            term("way", 4, "Cargo Terminal"),
            term("way", 5, None),
            {"type": "way", "id": 6, "tags": {"aeroway": "aerodrome", "iata": "ZZZ"}},
            term("way", 7, "Terminal 1"),  # belongs to an airport we don't list
        ],
        {"DEL"},
    )
    assert [(r["iata"], r["osm"], r["name"]) for r in rows] == [("DEL", "relation/3", "Terminal 3")]


@pytest.mark.integration
async def test_sightings_are_stored_and_summarised(tmp_path: Path) -> None:
    url = str(get_settings().database_url)
    engine = create_engine(url)
    try:
        async with engine.begin() as conn:
            await apply_bundle(conn, read_bundle())
            await conn.execute(delete(AirportSighting))
        rec = SightingRecorder(engine, flush_interval_s=0)
        planes = [aircraft(), aircraft(icao24="800abd"), aircraft(icao24="800abe", callsign="QQQ7")]
        await rec(snapshot(*planes), None)  # type: ignore[arg-type]
        await rec(snapshot(*planes), None)  # type: ignore[arg-type]  # duplicates merge

        async with make_client(url) as c:
            r = await c.get("/api/v1/airports/DEL/airlines-seen?days=30")
            assert r.status_code == 200
            body = r.json()
            assert body["iata"] == "DEL" and body["days_with_data"] >= 1
            seen = {a["icao"]: a for a in body["airlines"]}
            assert seen["TST"]["aircraft"] == 2 and seen["QQQ"]["aircraft"] == 1
            assert "not which terminal" in body["method"]
            assert (await c.get("/api/v1/airports/ZZZ/airlines-seen")).status_code == 404

            detail = (await c.get("/api/v1/airports/DEL")).json()
            mapped = detail["mapped_terminals"]
            assert mapped and mapped["items"] and "OpenStreetMap" in mapped["attribution"]
            assert mapped["provenance"]["status"] == "unverified"
            assert mapped["items"][0]["osm_url"].startswith("https://www.openstreetmap.org/")
            assert detail["terminals"] == []  # mapped terminals never count as verified ones
    finally:
        async with engine.begin() as conn:
            await conn.execute(delete(AirportSighting))
        await engine.dispose()


async def test_airlines_seen_503_when_database_is_down() -> None:
    async with make_client("postgresql+asyncpg://u:p@127.0.0.1:1/none") as c:
        r = await c.get("/api/v1/airports/DEL/airlines-seen")
        assert r.status_code == 503
