import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.ingestion.live import LiveService, Snapshot, SourceInfo
from app.providers.flight_info.adsbdb import parse as parse_route
from app.providers.positions import adsblol, opensky
from app.providers.positions.demo import DemoProvider
from app.providers.registry import build_position_providers
from app.schemas.positions import AircraftState, ReportedRoute, RouteAirport
from app.services.positions import (
    build_meta,
    compute_progress,
    get_positions,
    route_is_plausible,
)

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=UTC)
DEL = RouteAirport(iata="DEL", icao="VIDP", lat=28.5562, lon=77.1)
BOM = RouteAirport(iata="BOM", icao="VABB", lat=19.0896, lon=72.8656)


def state(**kw: object) -> AircraftState:
    base: dict[str, object] = dict(
        icao24="800abc", lat=23.0, lon=75.0, position_time=NOW, source="test"
    )
    base.update(kw)
    return AircraftState.model_validate(base)


def route(origin: RouteAirport = DEL, destination: RouteAirport = BOM) -> ReportedRoute:
    return ReportedRoute(
        callsign="AIC101",
        origin=origin,
        destination=destination,
        source="test",
        source_url="https://example.org",
    )


class FakeProvider:
    def __init__(self, name: str, aircraft: list[AircraftState] | None = None, fail: bool = False):
        self.name, self.url, self.attribution, self.is_demo = name, "https://x", "attr", False
        self.aircraft, self.fail, self.calls = aircraft or [], fail, 0

    async def fetch(self) -> list[AircraftState]:
        self.calls += 1
        await asyncio.sleep(0.01)
        if self.fail:
            raise httpx.ConnectError("down")
        return self.aircraft


class FakeStore:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.sets = 0

    async def get(self, name: str) -> str | None:
        return self.data.get(name)

    async def set(self, name: str, value: str, ex: int | None = None) -> object:
        self.sets += 1
        self.data[name] = value
        return True


class Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


# ---- normalisation ---------------------------------------------------------------------


def test_adsblol_normalises_and_keeps_unknowns_as_none() -> None:
    raw = {"hex": "8017A0", "flight": "IGO345Y ", "r": "VT-NCR", "t": "A21N", "alt_baro": 36000,
           "gs": 419.4, "track": 253.9, "baro_rate": -64, "lat": 19.2, "lon": 77.0, "seen_pos": 2}  # fmt: skip
    a = adsblol.normalise(raw, NOW)
    assert a is not None
    assert (a.icao24, a.callsign, a.type_code, a.alt_baro_ft) == (
        "8017a0",
        "IGO345Y",
        "A21N",
        36000,
    )
    assert a.position_time == NOW - timedelta(seconds=2)
    bare = adsblol.normalise({"hex": "800001", "lat": 20.0, "lon": 78.0}, NOW)
    assert bare is not None
    assert bare.callsign is None and bare.gs_kt is None and bare.alt_baro_ft is None


def test_adsblol_ground_and_out_of_coverage() -> None:
    ground = adsblol.normalise(
        {"hex": "800002", "alt_baro": "ground", "lat": 28.5, "lon": 77.1}, NOW
    )
    assert ground is not None and ground.on_ground and ground.alt_baro_ft is None
    assert adsblol.normalise({"hex": "800003", "lat": 51.5, "lon": -0.1}, NOW) is None
    assert adsblol.normalise({"hex": "800004"}, NOW) is None


def test_opensky_converts_units() -> None:
    s = ["80162c", "AXB159  ", "India", 1794575392, 1794575393, 84.6, 24.2, 10835.64, False,
         204.54, 297.08, -15.28, None, 11468.1, "6103", False, 0]  # fmt: skip
    a = opensky.normalise(s)
    assert a is not None
    assert a.callsign == "AXB159"
    assert a.alt_baro_ft == round(10835.64 * 3.28084)
    assert a.gs_kt == pytest.approx(397.6, abs=0.1)
    assert a.vrate_fpm == round(-15.28 * 196.8504)


def test_adsbdb_route_parsing() -> None:
    body = {"response": {"flightroute": {
        "callsign_iata": "6E345Y", "airline": {"name": "IndiGo", "iata": "6E"},
        "origin": {"iata_code": "HYD", "latitude": 17.23, "longitude": 78.43, "municipality": "Hyderabad"},
        "destination": {"iata_code": "BBI", "latitude": 20.24, "longitude": 85.82},
    }}}  # fmt: skip
    r = parse_route("IGO345Y", body)
    assert r is not None
    assert (r.flight_number, r.origin.iata, r.destination.iata) == ("6E345Y", "HYD", "BBI")
    assert parse_route("X", {"response": "unknown callsign"}) is None


# ---- registry and demo rules (ADR-0011) ------------------------------------------------


def test_demo_cannot_join_a_real_failover_chain() -> None:
    client = httpx.AsyncClient()
    with pytest.raises(ValueError, match="demo"):
        build_position_providers(["adsblol", "demo"], client)
    with pytest.raises(ValueError, match="unknown"):
        build_position_providers(["nope"], client)
    assert [p.name for p in build_position_providers(["adsblol", "opensky"], client)] == [
        "adsb.lol",
        "OpenSky Network",
    ]


async def test_demo_aircraft_are_obviously_fake() -> None:
    aircraft = await DemoProvider().fetch()
    assert aircraft
    for a in aircraft:
        assert a.is_demo and a.callsign and a.callsign.startswith("DEMO")
        assert a.registration and a.registration.startswith("DEMO-")


# ---- live service ----------------------------------------------------------------------


async def test_concurrent_requests_share_one_upstream_sweep() -> None:
    provider = FakeProvider("p", [state()])
    live = LiveService([provider], None, None)
    await asyncio.gather(*(live.snapshot() for _ in range(20)))
    assert provider.calls == 1


async def test_refresh_only_after_ttl() -> None:
    clock, provider = Clock(), FakeProvider("p", [state()])
    live = LiveService([provider], None, None, ttl_s=15, monotonic=clock)
    await live.snapshot()
    clock.t += 10
    await live.snapshot()
    assert provider.calls == 1
    clock.t += 6
    await live.snapshot()
    await asyncio.sleep(0.05)  # background refresh
    assert provider.calls == 2


async def test_stale_snapshot_is_served_while_refreshing() -> None:
    clock = Clock()
    provider = FakeProvider("p", [state(icao24="800001")])
    live = LiveService([provider], None, None, ttl_s=15, monotonic=clock)
    first = await live.snapshot()
    provider.aircraft = [state(icao24="800002")]
    clock.t += 20
    # Due for refresh: the old snapshot comes back immediately, not after the slow fetch.
    assert await live.snapshot() is first
    assert await live.snapshot() is first  # no second refresh started
    await asyncio.sleep(0.05)
    refreshed = await live.snapshot()
    assert refreshed is not None and refreshed.aircraft[0].icao24 == "800002"
    assert provider.calls == 2


async def test_failover_names_the_source_that_answered() -> None:
    down, up = FakeProvider("first", fail=True), FakeProvider("second", [state()])
    live = LiveService([down, up], None, None)
    snap = await live.snapshot()
    assert snap is not None and snap.source.name == "second"
    assert live.last_error and "first" in live.last_error


async def test_all_sources_down_keeps_previous_snapshot() -> None:
    clock, provider = Clock(), FakeProvider("p", [state()])
    live = LiveService([provider], None, None, ttl_s=15, monotonic=clock)
    first = await live.snapshot()
    provider.fail = True
    clock.t += 20
    assert await live.snapshot() is first
    await asyncio.sleep(0.05)
    assert await live.snapshot() is first
    assert live.last_error


async def test_warm_snapshot_written_at_most_once_a_minute_and_restored() -> None:
    clock, store = Clock(), FakeStore()
    live = LiveService([FakeProvider("p", [state()])], None, store, ttl_s=15, monotonic=clock)
    for _ in range(3):
        await live.snapshot()
        await asyncio.sleep(0.05)
        clock.t += 16
    assert store.sets == 1  # 3 refreshes within 60 s → one write
    restored = LiveService([FakeProvider("p")], None, store)
    await restored.warm_start()
    snap = restored._snapshot
    assert snap is not None and snap.aircraft[0].icao24 == "800abc"


class FakeRoutes:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def route_for_callsign(self, callsign: str) -> ReportedRoute | None:
        self.calls.append(callsign)
        return route() if callsign == "AIC101" else None


async def test_route_lookups_are_cached_including_misses() -> None:
    routes, store = FakeRoutes(), FakeStore()
    live = LiveService([FakeProvider("p")], routes, store)
    assert (await live.route("AIC101")) is not None
    assert (await live.route("AIC101")) is not None
    assert (await live.route("ZZZ1")) is None
    assert (await live.route("ZZZ1")) is None
    assert routes.calls == ["AIC101", "ZZZ1"]


async def test_background_enrichment_respects_budget() -> None:
    routes = FakeRoutes()
    aircraft = [state(icao24=f"80{i:04x}", callsign=f"CS{i}") for i in range(30)]
    live = LiveService([FakeProvider("p", aircraft)], routes, None, route_lookups_per_refresh=5)
    await live.snapshot()
    await asyncio.sleep(0.05)
    assert len(routes.calls) == 5


# ---- service rules ---------------------------------------------------------------------


def snap_at(fetched_at: datetime, demo: bool = False) -> Snapshot:
    return Snapshot(
        aircraft=[state()],
        source=SourceInfo("demo" if demo else "adsb.lol", "https://x", "attr", demo),
        fetched_at=fetched_at,
    )


@pytest.mark.parametrize(
    ("age_s", "demo", "mode"),
    [(10, False, "live"), (120, False, "degraded"), (400, False, "unavailable"),
     (10, True, "demo"), (120, True, "demo"), (400, True, "unavailable")],
)  # fmt: skip
def test_meta_modes(age_s: int, demo: bool, mode: str) -> None:
    meta = build_meta(snap_at(NOW - timedelta(seconds=age_s), demo), NOW)
    assert meta.mode == mode
    if demo and mode == "demo":
        assert meta.message and "not real" in meta.message


def test_meta_without_snapshot_is_unavailable() -> None:
    meta = build_meta(None, NOW)
    assert meta.mode == "unavailable" and meta.source is None and meta.message


def test_route_plausibility_rejects_contradicting_heading() -> None:
    # Over central India, DEL→BOM points roughly south-west (~225°).
    assert route_is_plausible(state(lat=23.0, lon=75.0, track_deg=215.0), route())
    assert not route_is_plausible(state(lat=23.0, lon=75.0, track_deg=40.0), route())
    # On the ground, or with no track, we can't judge: keep it.
    assert route_is_plausible(state(track_deg=40.0, on_ground=True), route())
    assert route_is_plausible(state(track_deg=None), route())


def test_progress_and_eta() -> None:
    p = compute_progress(state(lat=23.0, lon=75.0, gs_kt=450.0), route(), NOW)
    assert 0 < p.percent < 100
    assert p.minutes_remaining is not None and p.estimated_arrival is not None
    assert p.estimated_arrival == NOW + timedelta(minutes=p.minutes_remaining)
    slow = compute_progress(state(gs_kt=30.0), route(), NOW)
    assert slow.estimated_arrival is None  # no ETA unless genuinely flying


async def test_positions_hide_implausible_routes_and_filter_bbox() -> None:
    aircraft = [
        state(icao24="800001", callsign="AIC101", lat=23.0, lon=75.0, track_deg=215.0),
        state(icao24="800002", callsign="AIC101", lat=23.0, lon=75.5, track_deg=40.0),
        state(icao24="800003", lat=13.0, lon=80.0),
    ]
    live = LiveService([FakeProvider("p", aircraft)], FakeRoutes(), None)
    await live.route("AIC101")
    result = await get_positions(live, bbox=(70.0, 20.0, 80.0, 25.0))
    props = {f.id: f.properties for f in result.features}
    assert set(props) == {"800001", "800002"}
    assert props["800001"].destination_iata == "BOM"
    assert props["800002"].destination_iata is None
    assert result.meta.count == 2


# ---- rate limits -------------------------------------------------------------------------


class LimitedProvider(FakeProvider):
    async def fetch(self) -> list[AircraftState]:
        from app.providers.positions.base import ProviderRateLimitedError

        self.calls += 1
        raise ProviderRateLimitedError(self.name, 120)


async def test_rate_limited_source_rests_and_next_source_is_used() -> None:
    clock = Clock()
    limited, backup = LimitedProvider("primary"), FakeProvider("backup", [state()])
    live = LiveService([limited, backup], None, None, ttl_s=30, monotonic=clock)
    snap = await live.snapshot()
    assert snap is not None and snap.source.name == "backup"
    clock.t += 31
    await live.snapshot()
    await asyncio.sleep(0.05)
    assert limited.calls == 1  # still resting: not called again
    clock.t += 120
    await live.snapshot()
    await asyncio.sleep(0.05)
    assert limited.calls == 2  # rest over: tried again


async def test_adsblol_aborts_sweep_on_429() -> None:
    from app.providers.positions.adsblol import AdsbLolProvider
    from app.providers.positions.base import ProviderRateLimitedError

    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(429, headers={"Retry-After": "60"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderRateLimitedError) as info:
            await AdsbLolProvider(client, spacing_s=0).fetch()
    assert info.value.retry_after_s == 60
    assert len(seen) == 1  # stopped at the first 429 instead of hammering every grid point


async def test_opensky_429_is_a_rate_limit() -> None:
    from app.providers.positions.base import ProviderRateLimitedError
    from app.providers.positions.opensky import OpenSkyProvider

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"X-Rate-Limit-Retry-After-Seconds": "900"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderRateLimitedError) as info:
            await OpenSkyProvider(client).fetch()
    assert info.value.retry_after_s == 900


async def test_opensky_uses_a_cached_token_and_renews_it() -> None:
    from app.providers.positions import opensky as os_

    now = [0.0]
    tokens: list[str] = []
    seen_auth: list[str | None] = []
    reject_next = [False]

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url == os_.TOKEN_URL:
            assert b"grant_type=client_credentials" in request.content
            assert b"client_id=id" in request.content and b"client_secret=secret" in request.content
            tokens.append(f"t{len(tokens) + 1}")
            return httpx.Response(200, json={"access_token": tokens[-1], "expires_in": 1800})
        seen_auth.append(request.headers.get("authorization"))
        if reject_next[0]:
            reject_next[0] = False
            return httpx.Response(401)
        return httpx.Response(200, json={"states": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        p = os_.OpenSkyProvider(client, "id", "secret", clock=lambda: now[0])
        await p.fetch()
        await p.fetch()
        assert tokens == ["t1"] and seen_auth == ["Bearer t1", "Bearer t1"]  # reused

        reject_next[0] = True
        await p.fetch()  # 401: one renewal and retry
        assert tokens == ["t1", "t2"] and seen_auth[-2:] == ["Bearer t1", "Bearer t2"]

        now[0] = 1800.0  # past expiry (less the safety margin): renewed before the call
        await p.fetch()
        assert tokens[-1] == "t3" and seen_auth[-1] == "Bearer t3"


async def test_opensky_without_credentials_stays_anonymous() -> None:
    from app.providers.positions.opensky import OpenSkyProvider

    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"states": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await OpenSkyProvider(client).fetch()
        await OpenSkyProvider(client, "id", None).fetch()  # half-configured counts as none
    assert len(seen) == 2 and all("authorization" not in r.headers for r in seen)


async def test_adsbfi_uses_its_own_path_and_names_itself() -> None:
    from app.providers.positions.adsblol import GRID, AdsbFiProvider

    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, json={"ac": [{"hex": "800abc", "lat": 20.0, "lon": 78.0}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        aircraft = await AdsbFiProvider(client, spacing_s=0).fetch()
    assert len(paths) == len(GRID)
    assert paths[0].startswith("/api/v3/lat/")
    assert aircraft[0].source == "adsb.fi"


async def test_sweep_with_too_many_missing_regions_fails() -> None:
    from app.providers.positions.adsblol import AdsbLolProvider

    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls <= 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"ac": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(RuntimeError, match="3 of 10"):
            await AdsbLolProvider(client, spacing_s=0).fetch()


# ---- bounded waits and status -------------------------------------------------------------


class HangingProvider(FakeProvider):
    async def fetch(self) -> list[AircraftState]:
        self.calls += 1
        await asyncio.sleep(60)
        return []


async def test_a_hanging_provider_times_out_and_the_next_one_answers() -> None:
    hang, backup = HangingProvider("hang"), FakeProvider("backup", [state()])
    live = LiveService([hang, backup], None, None, provider_timeout_s=0.05, first_wait_s=2)
    snap = await live.snapshot()
    assert snap is not None and snap.source.name == "backup"
    status = live.status()
    providers = status["providers"]
    assert isinstance(providers, dict)
    assert providers["hang"]["ok"] is False and "timed out" in providers["hang"]["error"]
    assert providers["backup"]["ok"] is True and providers["backup"]["aircraft"] == 1
    await live.aclose()


async def test_first_request_waits_only_briefly_when_every_provider_hangs() -> None:
    live = LiveService([HangingProvider("hang")], None, None, first_wait_s=0.05)
    started = asyncio.get_running_loop().time()
    assert await live.snapshot() is None
    assert asyncio.get_running_loop().time() - started < 1
    await live.aclose()
