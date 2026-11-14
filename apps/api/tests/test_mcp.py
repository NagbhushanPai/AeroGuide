"""MCP server (ADR-0014): tool surface, errors, the HTTP transport and the rate limit."""

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from starlette.types import Receive, Scope, Send

from app.api.deps import AppResources
from app.core.config import Settings, get_settings
from app.database.session import create_engine
from app.ingestion.live import LiveService
from app.main import create_app
from app.mcp_server.ratelimit import RateLimit, client_key
from app.providers.positions.demo import DemoProvider
from app.seed.bundle import read_bundle
from app.seed.loader import apply_bundle
from tests.seed_fixtures import with_test_lounges
from tests.test_airports_api import UNREACHABLE_DB

TOOLS = {
    "search_airports",
    "get_airport",
    "airlines_seen",
    "list_lounges",
    "get_lounge",
    "list_lounge_programmes",
    "list_cards",
    "get_card",
    "check_lounge_access",
    "flights_near_airport",
    "get_flight",
}
MCP_HEADERS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


def make_app(database_url: str, **settings: Any) -> tuple[Any, FastMCP]:
    s = Settings(environment="test", database_url=database_url, **settings)
    app = create_app(s)
    app.state.resources = AppResources(
        settings=s,
        engine=create_engine(database_url),
        redis=None,  # type: ignore[arg-type]
        live=LiveService([DemoProvider()], None, None),
    )
    mcp: FastMCP = app.state.mcp
    return app, mcp


def rpc(method: str, params: dict[str, Any] | None = None, id_: int = 1) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}}


INIT = rpc(
    "initialize",
    {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "0"},
    },
)


async def test_tools_are_all_read_only_with_typed_inputs() -> None:
    _, mcp = make_app(UNREACHABLE_DB)
    tools = {t.name: t for t in await mcp.list_tools()}
    assert set(tools) == TOOLS
    for t in tools.values():
        assert t.annotations is not None and t.annotations.readOnlyHint is True, t.name
        assert t.annotations.destructiveHint is False, t.name
        assert t.description, t.name
        assert t.outputSchema is not None, t.name  # structured results, with provenance fields
    access = tools["check_lounge_access"].inputSchema
    assert set(access["required"]) == {"cards", "airport", "scope"}
    assert "card_number" not in access["properties"]


async def test_database_down_is_a_clear_tool_error() -> None:
    _, mcp = make_app(UNREACHABLE_DB)
    for name, args in [
        ("search_airports", {"query": "del"}),
        ("list_lounges", {"airport": "DEL"}),
        ("check_lounge_access", {"cards": ["x"], "airport": "DEL", "scope": "domestic"}),
    ]:
        with pytest.raises(ToolError, match="unavailable"):
            await mcp.call_tool(name, args)


async def test_invalid_arguments_are_rejected_before_any_query() -> None:
    _, mcp = make_app(UNREACHABLE_DB)
    for name, args in [
        ("get_airport", {"code": "D1"}),
        ("check_lounge_access", {"cards": [], "airport": "DEL", "scope": "domestic"}),
        ("check_lounge_access", {"cards": ["x"], "airport": "DEL", "scope": "space"}),
        ("check_lounge_access", {"cards": ["Not A Slug"], "airport": "DEL", "scope": "domestic"}),
        ("flights_near_airport", {"code": "DEL", "radius_km": 5000}),
        ("get_flight", {"icao24": "zzz"}),
    ]:
        with pytest.raises(ToolError) as exc:
            await mcp.call_tool(name, args)
        assert "unavailable" not in str(exc.value), (name, args)


async def test_untracked_flight_is_a_clear_tool_error() -> None:
    _, mcp = make_app(UNREACHABLE_DB)
    with pytest.raises(ToolError, match="isn't being tracked"):
        await mcp.call_tool("get_flight", {"icao24": "abcdef"})


async def test_http_transport_initialises_and_lists_tools() -> None:
    app, mcp = make_app(UNREACHABLE_DB)
    async with (
        mcp.session_manager.run(),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c,
    ):
        r = await c.post("/mcp", json=INIT, headers=MCP_HEADERS)
        assert r.status_code == 200, r.text
        assert r.json()["result"]["serverInfo"]["name"] == "AeroGuide"
        assert "Answer only from tool results" in r.json()["result"]["instructions"]

        r = await c.post("/mcp", json=rpc("tools/list", id_=2), headers=MCP_HEADERS)
        assert {t["name"] for t in r.json()["result"]["tools"]} == TOOLS

        r = await c.post(
            "/mcp",
            json=rpc("tools/call", {"name": "list_cards", "arguments": {}}, id_=3),
            headers=MCP_HEADERS,
        )
        result = r.json()["result"]
        assert result["isError"] is True and "unavailable" in result["content"][0]["text"]

        # The REST API still answers next to the MCP mount.
        assert (await c.get("/api/v1/airports/D1")).status_code == 422


async def test_unknown_host_header_is_refused() -> None:
    app, mcp = make_app(UNREACHABLE_DB)
    async with (
        mcp.session_manager.run(),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://evil.example"
        ) as c,
    ):
        assert (await c.post("/mcp", json=INIT, headers=MCP_HEADERS)).status_code == 421


async def test_render_hostname_is_allowed_automatically() -> None:
    s = Settings(environment="test", render_external_hostname="aeroguide.onrender.com")
    assert "aeroguide.onrender.com" in s.mcp_hosts
    assert Settings(
        environment="test", mcp_allowed_hosts="a.example, b.example"
    ).mcp_allowed_hosts == [
        "a.example",
        "b.example",
    ]


async def test_mcp_can_be_switched_off() -> None:
    app, mcp = make_app(UNREACHABLE_DB, mcp_enabled=False)
    assert mcp is None
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        assert (await c.post("/mcp", json=INIT, headers=MCP_HEADERS)).status_code == 404


async def _ok(scope: Scope, receive: Receive, send: Send) -> None:
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


async def test_rate_limit_is_per_client_and_rolls_over() -> None:
    now = [0.0]
    limited = RateLimit(_ok, per_minute=3, clock=lambda: now[0])
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=limited), base_url="http://t"
    ) as c:
        a = {"x-forwarded-for": "203.0.113.1, 10.0.0.1"}
        b = {"x-forwarded-for": "203.0.113.2"}
        assert [(await c.get("/", headers=a)).status_code for _ in range(3)] == [200] * 3
        blocked = await c.get("/", headers=a)
        assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) >= 1
        assert (await c.get("/", headers=b)).status_code == 200  # other clients unaffected
        now[0] = 61.0
        assert (await c.get("/", headers=a)).status_code == 200


def test_client_key_uses_the_address_the_proxy_appended() -> None:
    # The client controls everything before the last entry; Render appends the real address.
    scope: Scope = {"type": "http", "headers": [(b"x-forwarded-for", b"198.51.100.7, 10.1.1.1")]}
    assert client_key(scope) == "10.1.1.1"
    forged: Scope = {"type": "http", "headers": [(b"x-forwarded-for", b"1.2.3.4, 203.0.113.5")]}
    assert client_key(forged) == "203.0.113.5"
    assert client_key({"type": "http", "headers": [], "client": ("192.0.2.9", 1234)}) == "192.0.2.9"


@pytest.fixture
async def seeded_mcp(tmp_path: Path) -> AsyncIterator[tuple[Any, FastMCP]]:
    url = str(get_settings().database_url)
    engine = create_engine(url)
    try:
        async with engine.begin() as conn:
            await apply_bundle(conn, read_bundle(with_test_lounges(tmp_path)))
        yield make_app(url)
    finally:
        async with engine.begin() as conn:
            await apply_bundle(conn, read_bundle())
        await engine.dispose()


@pytest.mark.integration
async def test_tools_return_the_same_answers_as_the_api(seeded_mcp: tuple[Any, FastMCP]) -> None:
    app, mcp = seeded_mcp
    body = {
        "cards": ["test-bank-voyager"],
        "airport": "DEL",
        "on": "2026-11-20",
        "scope": "domestic",
    }
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        api = (await c.post("/api/v1/eligibility", json=body)).json()
    _, structured = await mcp.call_tool("check_lounge_access", body)  # type: ignore[misc]
    assert isinstance(structured, dict)
    assert structured["results"] == api["results"]
    assert structured["disclaimer"] == api["disclaimer"]

    _, airport = await mcp.call_tool("get_airport", {"code": "vidp"})  # type: ignore[misc]
    assert isinstance(airport, dict) and airport["iata"] == "DEL"
    assert airport["provenance"]["status"] in {"verified", "unverified", "outdated"}

    with pytest.raises(ToolError, match="No lounge"):
        await mcp.call_tool("get_lounge", {"slug": "nope"})

    _, near = await mcp.call_tool("flights_near_airport", {"code": "DEL", "radius_km": 150})  # type: ignore[misc]
    assert isinstance(near, dict) and near["airport"] == "DEL"
    distances = [f["distance_km"] for f in near["flights"]]
    assert distances == sorted(distances) and all(d <= 150 for d in distances)
