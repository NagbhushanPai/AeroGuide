"""Weekly data check (ADR-0013), against mocked HTTP. No network, no database."""

from datetime import date
from pathlib import Path

import httpx

from app.jobs.data_check import (
    PROVIDER_CHECKS,
    check_links,
    check_providers,
    content_hash,
    main_text,
    parse_previous_state,
    render,
    run,
)
from tests.seed_fixtures import copy_data

PAGE = "<html><head><style>p{}</style><script>track()</script></head><body><p>Hello &amp; welcome</p></body></html>"


def client(handler: httpx.MockTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=handler, follow_redirects=True)


def test_main_text_ignores_markup_scripts_and_spacing() -> None:
    assert main_text(PAGE) == "Hello & welcome"
    restyled = PAGE.replace("p{}", "p{color:red}").replace("<p>", '<p  class="x">\n')
    assert content_hash(restyled) == content_hash(PAGE)
    assert content_hash(PAGE.replace("welcome", "goodbye")) != content_hash(PAGE)


def test_previous_state_round_trips_through_the_report() -> None:
    assert parse_previous_state("") == {}
    assert parse_previous_state("<!-- data-check-state: {broken -->") == {}
    report_text = '...\n<!-- data-check-state: {"date":"2026-11-06","hashes":{"a":"111"}} -->\n'
    assert parse_previous_state(report_text) == {"a": "111"}


async def test_links_report_changes_redirects_errors_and_robots() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /private\n")
        if path == "/old":
            return httpx.Response(301, headers={"Location": "https://a.test/new"})
        if path == "/gone":
            return httpx.Response(404)
        return httpx.Response(200, text=PAGE)

    sources = [
        ("same", "https://a.test/same"),
        ("edited", "https://a.test/edited"),
        ("moved", "https://a.test/old"),
        ("gone", "https://a.test/gone"),
        ("private", "https://a.test/private"),
        ("new", "https://a.test/new-source"),
    ]
    previous = {"same": content_hash(PAGE), "edited": "0000", "moved": content_hash(PAGE)}
    async with client(httpx.MockTransport(handler)) as c:
        results = {r.key: r for r in await check_links(c, sources, previous, spacing_s=0)}

    assert results["same"].changed is False
    assert results["edited"].changed is True
    assert results["moved"].final_url == "https://a.test/new"
    assert results["gone"].status == 404 and results["gone"].content_hash is None
    assert results["private"].error == "disallowed by robots.txt"
    assert results["new"].changed is None  # nothing to compare with yet


async def test_providers_flag_bad_shapes_and_rate_limits() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host == "api.adsb.lol":
            return httpx.Response(200, json={"ac": [{}, {}]})
        if host == "opendata.adsb.fi":
            return httpx.Response(429)
        if host == "opensky-network.org":
            return httpx.Response(200, json={"unexpected": True})
        return httpx.Response(503)

    async with client(httpx.MockTransport(handler)) as c:
        results = {r.name: r for r in await check_providers(c, PROVIDER_CHECKS, spacing_s=0)}

    assert results["adsb.lol"].ok and "2 aircraft" in results["adsb.lol"].detail
    assert not results["adsb.fi"].ok and "429" in results["adsb.fi"].detail
    assert not results["OpenSky Network"].ok
    assert not results["adsbdb"].ok


async def test_full_run_renders_an_issue_with_state(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, json={"ac": [], "time": 1, "states": [], "response": {}})

    async with client(httpx.MockTransport(handler)) as c:
        report = await run(copy_data(tmp_path), "", c, date(2026, 11, 13), spacing_s=0)
    text = render(report)

    assert text.startswith("# Weekly data check — 2026-11-13")
    assert "Seed validation | ✅ passed" in text
    assert "4 of 4 OK" in text
    assert set(parse_previous_state(text)) == {s.key for s in report.links}


async def test_seed_problems_are_reported_not_raised(tmp_path: Path) -> None:
    data = copy_data(tmp_path)
    (data / "airport_guides" / "DEL.yaml").write_text("iata: nope\n", encoding="utf-8")

    async with client(httpx.MockTransport(lambda r: httpx.Response(404))) as c:
        report = await run(data, "", c, date(2026, 11, 13), spacing_s=0, provider_checks=[])
    assert report.seed_errors
    assert "Seed validation problems" in render(report)
