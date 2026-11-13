import httpx
import pytest

from app.api.deps import AppResources
from app.core.config import Settings
from app.database.session import create_engine
from app.ingestion.live import LiveService
from app.main import create_app
from app.providers.positions.demo import DemoProvider

UNREACHABLE_DB = "postgresql+asyncpg://user:pass@127.0.0.1:1/none"


@pytest.fixture
async def client() -> httpx.AsyncClient:
    settings = Settings(environment="test", database_url=UNREACHABLE_DB)
    app = create_app(settings)
    live = LiveService([DemoProvider()], None, None)
    app.state.resources = AppResources(
        settings=settings,
        engine=create_engine(UNREACHABLE_DB),
        redis=None,  # type: ignore[arg-type]
        live=live,
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c  # type: ignore[misc]


async def test_positions_returns_geojson_with_demo_meta(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/positions")
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert body["meta"]["mode"] == "demo"
    assert body["meta"]["count"] == len(body["features"]) > 0
    assert all(f["properties"]["is_demo"] for f in body["features"])
    assert "max-age" in r.headers["cache-control"]


async def test_positions_bbox_validation(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/positions?bbox=1,2,3")).status_code == 422
    assert (await client.get("/api/v1/positions?bbox=80,10,70,20")).status_code == 422
    ok = await client.get("/api/v1/positions?bbox=76,27,78,30")
    assert ok.status_code == 200


async def test_aircraft_detail_and_not_found(client: httpx.AsyncClient) -> None:
    listing = (await client.get("/api/v1/positions")).json()
    icao = listing["features"][0]["id"]
    detail = await client.get(f"/api/v1/positions/{icao}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["aircraft"]["is_demo"] is True
    assert body["reported_route"] is None and body["route_note"]
    assert (await client.get("/api/v1/positions/abcdef")).status_code == 404
    assert (await client.get("/api/v1/positions/not-hex")).status_code == 422
