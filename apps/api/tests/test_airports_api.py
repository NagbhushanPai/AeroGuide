"""Airport API. Integration tests seed the real YAML (plus a fake terminal) into Postgres."""

from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path

import httpx
import pytest

from app.api.deps import AppResources
from app.core.config import Settings, get_settings
from app.database.session import create_engine
from app.ingestion.live import LiveService
from app.main import create_app
from app.models.enums import VerificationStatus
from app.providers.positions.demo import DemoProvider
from app.seed.bundle import read_bundle
from app.seed.loader import apply_bundle
from app.services.airports import display_status
from tests.seed_fixtures import with_test_terminal

UNREACHABLE_DB = "postgresql+asyncpg://user:pass@127.0.0.1:1/none"


def make_client(database_url: str) -> httpx.AsyncClient:
    settings = Settings(environment="test", database_url=database_url)
    app = create_app(settings)
    app.state.resources = AppResources(
        settings=settings,
        engine=create_engine(database_url),
        redis=None,  # type: ignore[arg-type]
        live=LiveService([DemoProvider()], None, None),
    )
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def test_display_status_marks_old_verifications_outdated() -> None:
    today = date(2026, 11, 13)
    verified = VerificationStatus.VERIFIED
    assert display_status(verified, date(2026, 11, 1), 90, today) == "verified"
    assert display_status(verified, date(2026, 1, 1), 90, today) == "outdated"
    assert display_status(VerificationStatus.UNVERIFIED, None, 90, today) == "unverified"


async def test_database_down_returns_503_not_an_empty_list() -> None:
    async with make_client(UNREACHABLE_DB) as c:
        r = await c.get("/api/v1/airports?q=del")
        assert r.status_code == 503
        assert "unavailable" in r.json()["detail"]
        assert (await c.get("/api/v1/airports/DEL")).status_code == 503


async def test_code_validation() -> None:
    async with make_client(UNREACHABLE_DB) as c:
        assert (await c.get("/api/v1/airports/D1")).status_code == 422
        assert (await c.get("/api/v1/airports?limit=0")).status_code == 422
        assert (await c.get("/api/v1/airports?region=Nowhere")).status_code == 422


@pytest.fixture
async def seeded(tmp_path: Path) -> AsyncIterator[httpx.AsyncClient]:
    url = str(get_settings().database_url)
    engine = create_engine(url)
    try:
        async with engine.begin() as conn:
            await apply_bundle(conn, read_bundle(with_test_terminal(tmp_path)))
        async with make_client(url) as c:
            yield c
    finally:
        # Leave the database as the repository content describes it.
        async with engine.begin() as conn:
            await apply_bundle(conn, read_bundle())
        await engine.dispose()


@pytest.mark.integration
async def test_search_ranks_exact_codes_and_tolerates_typos(seeded: httpx.AsyncClient) -> None:
    async def codes(query: str) -> list[str]:
        r = await seeded.get(f"/api/v1/airports?{query}")
        assert r.status_code == 200
        return [a["iata"] for a in r.json()["items"]]

    assert (await codes("q=del"))[0] == "DEL"
    assert (await codes("q=vomm")) == ["MAA"]
    assert "COK" in await codes("q=kochi")
    assert "HYD" in await codes("q=Hydrabad")
    assert await codes("q=%25") == []  # LIKE wildcards are escaped
    guides = await codes("guides_only=true")
    assert set(guides) == {"DEL", "BOM", "BLR", "HYD", "MAA", "COK", "JAI"}
    north_east = (await seeded.get("/api/v1/airports?region=North-East&limit=200")).json()
    assert north_east["total"] == len(north_east["items"]) > 0
    assert {a["region"] for a in north_east["items"]} == {"North-East"}


@pytest.mark.integration
async def test_detail_carries_provenance_and_terminals(seeded: httpx.AsyncClient) -> None:
    r = await seeded.get("/api/v1/airports/vidp")
    assert r.status_code == 200
    body = r.json()
    assert body["iata"] == "DEL" and body["state"] == "Delhi" and body["region"] == "North"
    assert body["status"] == "unverified"  # geodata from a secondary source
    assert body["provenance"]["source"]["source_type"] == "secondary"
    assert body["official_source"]["url"].startswith("https://")
    assert "boarding pass" in body["terminal_note"]
    (terminal,) = body["terminals"]
    assert terminal["code"] == "T9" and terminal["provenance"]["status"] == "verified"
    assert terminal["provenance"]["reverify_due"] == "2027-04-30"
    (assignment,) = terminal["airlines"]
    assert assignment["airline"]["icao"] == "TST"
    assert assignment["scope_note"] == "test flights only"
    assert assignment["provenance"]["status"] == "unverified"
    assert (await seeded.get("/api/v1/airports/ZZZ")).status_code == 404


@pytest.mark.integration
async def test_seed_is_idempotent_and_removes_deleted_content(tmp_path: Path) -> None:
    engine = create_engine(str(get_settings().database_url))
    try:
        test_bundle = read_bundle(with_test_terminal(tmp_path))
        async with engine.begin() as conn:
            first = await apply_bundle(conn, test_bundle)
        async with engine.begin() as conn:
            second = await apply_bundle(conn, test_bundle)
        assert first == second and first.terminals == 1 and first.terminal_airlines == 1

        async with engine.begin() as conn:
            back = await apply_bundle(conn, read_bundle())
        assert back.terminals == 0 and back.airlines == 0
    finally:
        await engine.dispose()
