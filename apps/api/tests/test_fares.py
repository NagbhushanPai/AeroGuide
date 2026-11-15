"""Fare search (ADR-0015). No test touches the network: Ignav is replaced by httpx.MockTransport
with fixtures shaped like its OpenAPI spec, and the endpoint tests use the demo provider."""

import asyncio
import inspect
import json
import logging
from collections.abc import Callable
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from pydantic import ValidationError

from app.api.deps import AppResources
from app.core.config import Settings
from app.core.india import today_ist
from app.database.session import create_engine
from app.fares.budget import BudgetGuard, BudgetPolicy, InMemoryUsageLedger, Usage
from app.fares.cache import InMemoryFareCache, cache_key
from app.fares.cities import airport_pairs
from app.fares.ranking import Filters, Weights, apply_filters, dedupe, sort_offers
from app.ingestion.live import LiveService
from app.main import create_app
from app.providers.fares import ignav
from app.providers.fares.base import BudgetExceededError, ProviderError
from app.providers.fares.ignav import IgnavProvider, normalise
from app.providers.fares.mock import MockProvider
from app.providers.positions.demo import DemoProvider
from app.providers.registry import build_fare_providers
from app.schemas.fares import (
    BookingLink,
    BookingLinksRequest,
    FareQuery,
    FareSearchRequest,
    Offer,
    Passengers,
)
from app.services.fares import FareSearchService, FareSearchUnavailableError

FIXTURES = Path(__file__).parent / "fixtures" / "ignav"
KEY = "test-key-not-real-123"
D = date(2026, 12, 10)


def fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES / name).read_text("utf-8"))
    return data


def soon(days: int = 20) -> date:
    return today_ist() + timedelta(days=days)


def guard(cap: int = 900, daily: int | None = None, monthly: int | None = None) -> BudgetGuard:
    return BudgetGuard(
        InMemoryUsageLedger(),
        BudgetPolicy(total_cap=cap, daily_cap=daily, monthly_cap=monthly),
        today=lambda: date(2026, 11, 15),
    )


async def _no_sleep(_: float) -> None:
    return None


def ignav_provider(
    handler: Callable[[httpx.Request], httpx.Response],
    budget: BudgetGuard | None = None,
    sleeps: list[float] | None = None,
) -> IgnavProvider:
    async def sleep(s: float) -> None:
        if sleeps is not None:
            sleeps.append(s)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return IgnavProvider(client, KEY, budget or guard(), min_interval_s=0, sleep=sleep)


def ignav_error(status: int, code: str, headers: dict[str, str] | None = None) -> httpx.Response:
    body = {"error": {"type": "x", "code": code, "message": "m", "field": None}}
    return httpx.Response(status, json=body, headers=headers)


# ---- normalisation ----------------------------------------------------------------------


def test_one_way_response_is_normalised_and_bad_itineraries_skipped() -> None:
    q = FareQuery(origin="DEL", destination="BOM", departure_date=D)
    offers = normalise(fixture("one_way_del_bom.json"), q)
    assert [o.booking.reference for o in offers] == ["ig_one", "ig_two"]  # 2 malformed skipped
    nonstop, onestop = offers
    assert nonstop.outbound.flight_numbers == ["6E2134"]  # code added to a bare number
    assert nonstop.outbound.carrier_names == ["IndiGo"]
    assert (nonstop.price, nonstop.currency, nonstop.price_verified) == (5432, "INR", True)
    assert nonstop.stops == 0 and nonstop.total_duration_minutes == 135
    assert nonstop.outbound.departure_local == "2026-12-10T06:15:00"
    assert nonstop.outbound.departure_timezone == "Asia/Kolkata"
    assert onestop.outbound.flight_numbers == ["AI805", "AI2952"]  # spaces removed, no double
    assert onestop.stops == 1 and onestop.outbound.origin == "DEL"
    assert onestop.outbound.destination == "BOM"
    # No leg duration given: computed from UTC times (09:00 to 14:05 IST).
    assert onestop.outbound.duration_minutes == 305
    assert onestop.price_verified is False
    assert all(o.provider == "ignav" and not o.is_demo for o in offers)
    assert offers[0].id == normalise(fixture("one_way_del_bom.json"), q)[0].id  # stable


def test_round_trip_response_has_both_legs() -> None:
    q = FareQuery(origin="BLR", destination="HYD", departure_date=D, return_date=D + timedelta(4))
    (offer,) = normalise(fixture("round_trip_blr_hyd.json"), q)
    assert offer.inbound is not None
    assert offer.outbound.flight_numbers == ["QP1385"]
    assert offer.inbound.flight_numbers == ["SG3015"]
    assert offer.total_duration_minutes == 155 and offer.mixed_carriers


# ---- dedupe, filters, sorting -------------------------------------------------------------


async def demo_offers(n: int = 15) -> list[Offer]:
    return await MockProvider(n).search(
        FareQuery(origin="DEL", destination="BOM", departure_date=D)
    )


def with_price(o: Offer, price: float, provider: str = "other") -> Offer:
    return o.model_copy(update={"price": price, "provider": provider, "id": f"{provider}-x"})


async def test_dedupe_keeps_the_cheapest_copy_of_the_same_flights() -> None:
    (a,) = await demo_offers(1)
    kept = dedupe([a, with_price(a, a.price - 100), with_price(a, a.price + 100)])
    assert len(kept) == 1 and kept[0].price == a.price - 100


async def test_filters() -> None:
    offers = await demo_offers()
    assert all(o.stops == 0 for o in apply_filters(offers, Filters(max_stops=0)))
    assert any(o.stops == 1 for o in offers)
    indigo = apply_filters(offers, Filters(airlines=frozenset({"6E"})))
    assert indigo and all(o.outbound.carriers == ["6E"] for o in indigo)
    cheap = apply_filters(offers, Filters(max_price=6000))
    assert all(o.price <= 6000 for o in cheap)
    morning = apply_filters(offers, Filters(depart_after_hour=6, depart_before_hour=12))
    assert all(6 <= int(o.outbound.departure_local[11:13]) < 12 for o in morning)


async def test_sorting() -> None:
    offers = await demo_offers()
    w = Weights()
    cheapest = sort_offers(offers, "cheapest", w)
    assert [o.price for o in cheapest] == sorted(o.price for o in offers)
    fastest = sort_offers(offers, "fastest", w)
    assert [o.total_duration_minutes for o in fastest] == sorted(
        o.total_duration_minutes for o in offers
    )
    # With all weight on price, "best" is the cheapest order.
    assert [o.id for o in sort_offers(offers, "best", Weights(1, 0, 0))] == [o.id for o in cheapest]


def test_weights_parse_and_normalise() -> None:
    assert Weights.parse("6,3,1") == Weights(0.6, 0.3, 0.1)
    for bad in ("1,2", "-1,1,1", "0,0,0", "a,b,c"):
        with pytest.raises(ValueError):
            Weights.parse(bad)


# ---- validation and cities ----------------------------------------------------------------


def test_request_validation() -> None:
    ok = FareSearchRequest(origin="del", destination="bom", departure_date=soon())
    assert (ok.origin, ok.destination) == ("DEL", "BOM")
    bad: list[dict[str, Any]] = [
        {"origin": "DEL", "destination": "DEL", "departure_date": soon()},
        {"origin": "DEL", "destination": "BOM", "departure_date": today_ist() - timedelta(1)},
        {"origin": "DEL", "destination": "BOM", "departure_date": soon(), "return_date": soon(1)},
        {"origin": "DELHI", "destination": "BOM", "departure_date": soon()},
        {"origin": "DEL", "destination": "BOM", "departure_date": soon(), "card": "4111"},
        {"origin": "DEL", "destination": "BOM", "departure_date": soon(400)},
        {
            "origin": "DEL",
            "destination": "BOM",
            "departure_date": soon(),
            "depart_after_hour": 12,
            "depart_before_hour": 9,
        },
    ]
    for body in bad:
        with pytest.raises(ValidationError):
            FareSearchRequest.model_validate(body)
    with pytest.raises(ValidationError):
        Passengers(adults=5, children=5)
    with pytest.raises(ValidationError):
        Passengers(adults=1, infants_on_lap=2)


def test_multi_airport_cities_are_searched_only_when_asked() -> None:
    assert airport_pairs("GOI", "DEL", False) == [("GOI", "DEL")]
    assert airport_pairs("GOI", "DEL", True) == [
        ("GOI", "DEL"),
        ("GOI", "DXN"),
        ("GOX", "DEL"),
        ("GOX", "DXN"),
    ]
    assert airport_pairs("BLR", "HYD", True) == [("BLR", "HYD")]


# ---- cache ------------------------------------------------------------------------------


async def test_in_memory_cache_expires_and_stays_bounded() -> None:
    now = [0.0]
    cache = InMemoryFareCache(max_entries=2, clock=lambda: now[0])
    await cache.set("a", "1", 60)
    assert await cache.get("a") == "1"
    now[0] = 61
    assert await cache.get("a") is None
    for k in ("b", "c", "d"):
        await cache.set(k, k, 60)
    assert await cache.get("b") is None and await cache.get("d") == "d"


def test_cache_key_covers_route_dates_passengers_cabin_and_currency() -> None:
    q = FareQuery(origin="DEL", destination="BOM", departure_date=D)
    base = cache_key([("DEL", "BOM")], q, "market-IN", ["ignav"])
    variants = [
        cache_key(
            [("DEL", "BOM")], q.model_copy(update={"cabin": "business"}), "market-IN", ["ignav"]
        ),
        cache_key([("DEL", "BOM")], q, "market-US", ["ignav"]),
        cache_key(
            [("DEL", "BOM")], q.model_copy(update={"return_date": D}), "market-IN", ["ignav"]
        ),
        cache_key(
            [("DEL", "BOM")],
            q.model_copy(update={"passengers": Passengers(adults=2)}),
            "market-IN",
            ["ignav"],
        ),
    ]
    assert len({base, *variants}) == 5


# ---- budget -------------------------------------------------------------------------------


async def test_budget_caps_and_the_95_percent_reminder() -> None:
    g = guard(cap=20)
    statuses = [await g.reserve("ignav") for _ in range(20)]
    assert statuses[17].near_limit is False and statuses[18].near_limit is True  # 19 of 20
    assert statuses[18].message and "19 of 20" in statuses[18].message
    with pytest.raises(BudgetExceededError) as exc:
        await g.reserve("ignav")
    assert "allowance of 20" in exc.value.message
    status = await g.status("ignav")
    assert status is not None and status.used == 20 and status.near_limit


async def test_daily_and_monthly_caps() -> None:
    policy = BudgetPolicy(total_cap=900, monthly_cap=50, daily_cap=10)
    assert policy.refusal(Usage(total=10, month=10, today=10)) is not None
    assert "this month" in (policy.refusal(Usage(total=50, month=50, today=0)) or "")
    assert policy.refusal(Usage(total=40, month=40, today=9)) is None
    # The closer limit is the one reported.
    assert policy.status("ignav", Usage(total=100, month=49, today=0)).cap == 50


# ---- Ignav transport: retries, budget, secrets ---------------------------------------------


async def test_successful_search_sends_key_and_india_market_and_counts_one_request() -> None:
    seen: list[httpx.Request] = []

    def handler(r: httpx.Request) -> httpx.Response:
        seen.append(r)
        return httpx.Response(200, json=fixture("one_way_del_bom.json"))

    g = guard()
    p = ignav_provider(handler, g)
    offers = await p.search(FareQuery(origin="DEL", destination="BOM", departure_date=D))
    assert len(offers) == 2
    (req,) = seen
    assert req.url.path == "/api/fares/one-way" and req.headers["x-api-key"] == KEY
    body = json.loads(req.content)
    assert body["market"] == "IN" and body["origin"] == "DEL" and body["adults"] == 1
    assert "max_stops" not in body  # filters are applied locally, so results can be cached
    assert (await g.status("ignav")).used == 1  # type: ignore[union-attr]


async def test_round_trip_uses_the_round_trip_endpoint() -> None:
    seen: list[httpx.Request] = []

    def handler(r: httpx.Request) -> httpx.Response:
        seen.append(r)
        return httpx.Response(200, json=fixture("round_trip_blr_hyd.json"))

    q = FareQuery(origin="BLR", destination="HYD", departure_date=D, return_date=D + timedelta(4))
    (offer,) = await ignav_provider(handler).search(q)
    assert seen[0].url.path == "/api/fares/round-trip"
    assert json.loads(seen[0].content)["return_date"] == "2026-12-14"
    assert offer.inbound is not None


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (400, "invalid_airport_code"),
        (401, "invalid_api_key"),
        (402, "billing_required"),
        (424, "unsupported_search"),
        (429, "monthly_spend_limit_reached"),
    ],
)
async def test_client_errors_are_never_retried(status: int, code: str) -> None:
    calls = 0

    def handler(r: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return ignav_error(status, code)

    with pytest.raises(ProviderError) as exc:
        await ignav_provider(handler).search(
            FareQuery(origin="DEL", destination="BOM", departure_date=D)
        )
    assert calls == 1 and not exc.value.retryable and exc.value.code == code


async def test_transient_errors_are_retried_with_backoff_and_each_attempt_counted() -> None:
    responses = [
        ignav_error(424, "unable_to_complete_request"),
        ignav_error(503, "server_busy", {"Retry-After": "3"}),
        httpx.Response(200, json=fixture("one_way_del_bom.json")),
    ]

    def handler(r: httpx.Request) -> httpx.Response:
        return responses.pop(0)

    g, sleeps = guard(), []
    offers = await ignav_provider(handler, g, sleeps).search(
        FareQuery(origin="DEL", destination="BOM", departure_date=D)
    )
    assert len(offers) == 2
    assert sleeps == [1.0, 3.0]  # backoff, then the Retry-After header
    assert (await g.status("ignav")).used == 3  # type: ignore[union-attr]


async def test_retries_stop_after_the_limit() -> None:
    calls = 0

    def handler(r: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectTimeout("slow")

    with pytest.raises(ProviderError) as exc:
        await ignav_provider(handler).search(
            FareQuery(origin="DEL", destination="BOM", departure_date=D)
        )
    assert calls == 3 and exc.value.code == "timeout"  # 1 + 2 retries


async def test_no_request_is_sent_once_the_budget_is_used_up() -> None:
    calls = 0

    def handler(r: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=fixture("one_way_del_bom.json"))

    p = ignav_provider(handler, guard(cap=1))
    await p.search(FareQuery(origin="DEL", destination="BOM", departure_date=D))
    with pytest.raises(BudgetExceededError):
        await p.search(FareQuery(origin="DEL", destination="BLR", departure_date=D))
    assert calls == 1


async def test_the_api_key_never_appears_in_logs_or_repr(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)

    def handler(r: httpx.Request) -> httpx.Response:
        return ignav_error(401, "invalid_api_key")

    p = ignav_provider(handler)
    with pytest.raises(ProviderError) as exc:
        await p.search(FareQuery(origin="DEL", destination="BOM", departure_date=D))
    assert KEY not in caplog.text and KEY not in repr(p) and KEY not in str(exc.value)


async def test_booking_links_are_https_only_unique_and_cheapest_first() -> None:
    seen: list[httpx.Request] = []

    def handler(r: httpx.Request) -> httpx.Response:
        seen.append(r)
        return httpx.Response(200, json=fixture("booking_links.json"))

    links = await ignav_provider(handler).booking_links("ig_one")
    assert json.loads(seen[0].content) == {"ignav_id": "ig_one"}
    assert [link.seller for link in links] == ["Some OTA", "IndiGo"]
    assert all(link.url.startswith("https://") for link in links)


def test_ignav_airport_search_is_never_called() -> None:
    """Ignav bills airport searches; autocomplete uses AeroGuide's own airport data."""
    assert "/airports" not in inspect.getsource(ignav)
    assert not hasattr(IgnavProvider, "airports")


def test_registry_rules() -> None:
    client = httpx.AsyncClient()
    kw: dict[str, Any] = dict(
        ignav_base_url="https://x",
        ignav_market="IN",
        ignav_timeout_s=1,
        ignav_max_retries=0,
        ignav_min_interval_s=0,
        ignav_max_concurrent=1,
    )
    assert build_fare_providers(["ignav"], client, guard(), ignav_api_key=None, **kw) == []
    with pytest.raises(ValueError, match="on its own"):
        build_fare_providers(["ignav", "mock"], client, guard(), ignav_api_key=KEY, **kw)
    with pytest.raises(ValueError, match="unknown"):
        build_fare_providers(["skyscanner"], client, guard(), ignav_api_key=KEY, **kw)


# ---- the search service -------------------------------------------------------------------


class FakeProvider:
    is_demo = False

    def __init__(
        self,
        name: str,
        offers: list[Offer] | None = None,
        error: Exception | None = None,
        delay: float = 0.0,
    ) -> None:
        self.name, self._offers, self._error, self._delay = name, offers or [], error, delay
        self.calls = 0

    async def search(self, query: FareQuery) -> list[Offer]:
        self.calls += 1
        if self._delay:
            await asyncio.sleep(self._delay)
        if self._error:
            raise self._error
        return [o.model_copy(update={"provider": self.name}) for o in self._offers]

    async def booking_links(self, reference: str) -> list[BookingLink]:
        return []


def service(*providers: Any, timeout: float = 5.0) -> FareSearchService:
    return FareSearchService(
        list(providers),
        InMemoryFareCache(),
        budget=guard(),
        currency_key="market-IN",
        provider_timeout_s=timeout,
    )


def request(**kw: Any) -> FareSearchRequest:
    return FareSearchRequest.model_validate(
        {"origin": "DEL", "destination": "BOM", "departure_date": soon(), **kw}
    )


async def test_cache_hit_reuses_results_and_filters_cost_nothing() -> None:
    p = FakeProvider("a", await demo_offers())
    s = service(p)
    first = await s.search(request())
    second = await s.search(request(max_stops=0, sort="cheapest"))
    assert p.calls == 1 and not first.cached and second.cached
    assert second.total_offers == first.total_offers
    assert all(o.stops == 0 for o in second.offers)


async def test_one_failing_provider_doesnt_fail_the_search_and_isnt_cached() -> None:
    good = FakeProvider("good", await demo_offers(3))
    bad = FakeProvider("bad", error=ProviderError("bad", "Down.", code="x"))
    s = service(good, bad)
    r = await s.search(request())
    assert len(r.offers) == 3
    assert {o.provider: o.status for o in r.providers} == {"good": "ok", "bad": "error"}
    await s.search(request())
    assert good.calls == 2  # the partial result wasn't cached


async def test_a_slow_provider_times_out_without_holding_up_the_rest() -> None:
    fast = FakeProvider("fast", await demo_offers(2))
    slow = FakeProvider("slow", await demo_offers(2), delay=1.0)
    r = await service(fast, slow, timeout=0.05).search(request())
    assert {o.provider: o.status for o in r.providers}["slow"] == "timeout"
    assert {o.provider for o in r.offers} == {"fast"}


async def test_all_providers_failing_maps_to_a_status() -> None:
    budget = FakeProvider("a", error=BudgetExceededError("a", "Paused."))
    with pytest.raises(FareSearchUnavailableError) as exc:
        await service(budget).search(request())
    assert exc.value.status == 429 and exc.value.message == "Paused."
    slow = FakeProvider("b", delay=1.0)
    with pytest.raises(FareSearchUnavailableError) as exc:
        await service(slow, timeout=0.01).search(request())
    assert exc.value.status == 504
    with pytest.raises(FareSearchUnavailableError) as exc:
        await service().search(request())
    assert exc.value.status == 503


async def test_round_trip_through_the_demo_provider() -> None:
    s = FareSearchService(
        [MockProvider()], InMemoryFareCache(), budget=None, currency_key="market-IN"
    )
    r = await s.search(request(return_date=soon(25)))
    assert r.is_demo and r.offers and all(o.inbound is not None and o.is_demo for o in r.offers)
    links = await s.booking_links(
        BookingLinksRequest(provider="mock", reference=r.offers[0].booking.reference)
    )
    assert links.links[0].url.startswith("https://example.org/")


# ---- endpoints (demo provider, no database needed) -----------------------------------------

UNREACHABLE_DB = "postgresql+asyncpg://user:pass@127.0.0.1:1/none"


def fares_client(fares: FareSearchService | None) -> httpx.AsyncClient:
    settings = Settings(environment="test", database_url=UNREACHABLE_DB)
    app = create_app(settings)
    app.state.resources = AppResources(
        settings=settings,
        engine=create_engine(UNREACHABLE_DB),
        redis=None,
        live=LiveService([DemoProvider()], None, None),
        fares=fares,
    )
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_search_endpoint_with_the_demo_provider() -> None:
    demo = FareSearchService([MockProvider()], InMemoryFareCache(), budget=None, currency_key="IN")
    async with fares_client(demo) as c:
        body = {
            "origin": "blr",
            "destination": "HYD",
            "departure_date": soon().isoformat(),
            "passengers": {"adults": 2},
            "sort": "cheapest",
        }
        r = await c.post("/api/v1/fares/search", json=body)
        assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
        data = r.json()
        assert data["is_demo"] and data["routes"] == ["BLR-HYD"]
        prices = [o["price"] for o in data["offers"]]
        assert prices == sorted(prices) and data["offers"][0]["currency"] == "INR"
        assert {a["code"] for a in data["airlines"]} == {"6E", "AI", "IX", "QP", "SG"}
        assert "generated" in data["notice"]

        ref = data["offers"][0]["booking"]
        links = await c.post("/api/v1/fares/booking-links", json=ref)
        assert links.status_code == 200 and links.json()["links"]
        missing = await c.post(
            "/api/v1/fares/booking-links", json={"provider": "mock", "reference": "nope"}
        )
        assert missing.status_code == 404

        past = {**body, "departure_date": (today_ist() - timedelta(1)).isoformat()}
        assert (await c.post("/api/v1/fares/search", json=past)).status_code == 422
        assert (await c.post("/api/v1/fares/search", json={**body, "extra": 1})).status_code == 422


async def test_search_endpoint_says_when_fare_search_isnt_set_up() -> None:
    async with fares_client(None) as c:
        r = await c.post(
            "/api/v1/fares/search",
            json={"origin": "DEL", "destination": "BOM", "departure_date": soon().isoformat()},
        )
        assert r.status_code == 503 and "isn't set up" in r.json()["detail"]


async def test_fares_endpoints_have_a_tighter_per_client_rate_limit() -> None:
    settings = Settings(
        environment="test", database_url=UNREACHABLE_DB, fares_rate_limit_per_minute=2
    )
    app = create_app(settings)
    app.state.resources = AppResources(
        settings=settings,
        engine=create_engine(UNREACHABLE_DB),
        redis=None,
        live=LiveService([DemoProvider()], None, None),
        fares=None,
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        codes = [(await c.get("/api/v1/fares/budget")).status_code for _ in range(3)]
    assert codes == [503, 503, 429]


@pytest.mark.integration
async def test_postgres_ledger_holds_the_cap_under_concurrent_requests() -> None:
    from sqlalchemy import text

    from app.core.config import get_settings
    from app.fares.budget import PostgresUsageLedger

    engine = create_engine(str(get_settings().database_url))
    try:
        async with engine.begin() as conn:
            await conn.execute(text("DELETE FROM provider_usage WHERE provider = 'test-ledger'"))
        g = BudgetGuard(
            PostgresUsageLedger(engine),
            BudgetPolicy(total_cap=5),
            today=lambda: date(2026, 11, 15),
        )
        results = await asyncio.gather(
            *(g.reserve("test-ledger") for _ in range(12)), return_exceptions=True
        )
        assert sum(not isinstance(r, Exception) for r in results) == 5
        assert all(isinstance(r, BudgetExceededError) for r in results if isinstance(r, Exception))
        status = await g.status("test-ledger")
        assert status is not None and status.used == 5
    finally:
        async with engine.begin() as conn:
            await conn.execute(text("DELETE FROM provider_usage WHERE provider = 'test-ledger'"))
        await engine.dispose()


# ---- real Ignav response, India only --------------------------------------------------------


def test_real_ignav_response_normalises() -> None:
    q = FareQuery(origin="BLR", destination="HYD", departure_date=date(2026, 12, 6))
    offers = normalise(fixture("real_one_way_blr_hyd.json"), q)
    assert len(offers) == 5 and all(o.currency == "INR" for o in offers)
    assert all(o.outbound.flight_numbers[0][:2] == o.outbound.carriers[0] for o in offers)
    assert all(len(o.booking.reference) == 32 for o in offers)
    via_colombo = [o for o in offers if "CMB" in {s.destination for s in o.outbound.segments}]
    assert len(via_colombo) == 1 and via_colombo[0].stops == 1


class Codes:
    async def codes(self) -> frozenset[str]:
        return frozenset({"BLR", "HYD", "DEL", "BOM", "GOI", "GOX"})


async def test_connections_abroad_are_left_out_of_domestic_results() -> None:
    q = FareQuery(origin="BLR", destination="HYD", departure_date=date(2026, 12, 6))
    real = normalise(fixture("real_one_way_blr_hyd.json"), q)
    s = FareSearchService(
        [FakeProvider("ignav", real)],
        InMemoryFareCache(),
        budget=None,
        currency_key="market-IN",
        airports=Codes(),
    )
    r = await s.search(request(origin="BLR", destination="HYD"))
    assert r.excluded_abroad == 1 and r.total_offers == 4
    assert all("CMB" not in {seg.destination for seg in o.outbound.segments} for o in r.offers)
    # Without the airport list, time zones decide (Colombo isn't Asia/Kolkata).
    no_list = FareSearchService(
        [FakeProvider("ignav", real)], InMemoryFareCache(), budget=None, currency_key="IN"
    )
    assert (await no_list.search(request(origin="BLR", destination="HYD"))).excluded_abroad == 1


async def test_non_indian_airports_are_refused_before_any_upstream_request() -> None:
    p = FakeProvider("ignav", [])
    s = FareSearchService(
        [p], InMemoryFareCache(), budget=None, currency_key="IN", airports=Codes()
    )
    with pytest.raises(FareSearchUnavailableError) as exc:
        await s.search(request(origin="DEL", destination="DXB"))
    assert exc.value.status == 422 and "DXB" in exc.value.message and p.calls == 0
    # Nearby airports not in the list are dropped rather than searched.
    await s.search(request(origin="GOI", destination="DEL", nearby_airports=True))
    assert p.calls == 2  # GOI-DEL and GOX-DEL; DXN isn't in this list
