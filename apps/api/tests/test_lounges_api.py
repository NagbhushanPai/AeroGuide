"""Lounges, cards and eligibility, against Postgres seeded with fictional fixtures."""

from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest

from app.core.config import get_settings
from app.database.session import create_engine
from app.seed.bundle import SeedError, due_for_review, read_bundle
from app.seed.loader import apply_bundle
from tests.seed_fixtures import TEST_CARD, with_test_lounges
from tests.test_airports_api import UNREACHABLE_DB, make_client


def test_fixture_bundle_is_valid(tmp_path: Path) -> None:
    bundle = read_bundle(with_test_lounges(tmp_path))
    assert [c.slug for c in bundle.cards] == ["test-bank-voyager"]
    assert {lg.slug for f in bundle.lounges for lg in f.lounges} == {
        "test-lounge-del-t9",
        "test-lounge-del-intl",
    }


def test_card_network_may_be_left_unstated(tmp_path: Path) -> None:
    data = with_test_lounges(tmp_path)
    card = data / "cards" / "test-bank--voyager.yaml"
    card.write_text(TEST_CARD.replace("network: visa\n", ""), "utf-8")
    assert read_bundle(data).cards[0].network is None


def test_overlapping_policy_versions_are_rejected(tmp_path: Path) -> None:
    data = with_test_lounges(tmp_path)
    card = data / "cards" / "test-bank--voyager.yaml"
    card.write_text(TEST_CARD.replace("valid_to: 2026-07-01", "valid_to: 2026-08-01"), "utf-8")
    with pytest.raises(SeedError) as exc:
        read_bundle(data)
    assert any("overlapping domestic policy versions" in e for e in exc.value.errors)


def test_unknown_references_are_rejected(tmp_path: Path) -> None:
    data = with_test_lounges(tmp_path)
    card = data / "cards" / "test-bank--voyager.yaml"
    card.write_text(
        TEST_CARD.replace("bank: test-bank", "bank: nope")
        .replace("network: visa", "network: nope")
        .replace(
            "program: test-programme }\n      - { type: visit_quota, count: 2",
            "program: ghost }\n      - { type: visit_quota, count: 2",
        ),
        "utf-8",
    )
    lounges = data / "lounges" / "DEL.yaml"
    lounges.write_text(
        lounges.read_text("utf-8").replace("amenities: [wifi, food]", "amenities: [wifi, jacuzzi]"),
        "utf-8",
    )
    with pytest.raises(SeedError) as exc:
        read_bundle(data)
    errors = "\n".join(exc.value.errors)
    for expected in (
        "unknown bank 'nope'",
        "unknown network 'nope'",
        "unknown programme 'ghost'",
        "unknown amenity 'jacuzzi'",
    ):
        assert expected in errors


def test_review_queue_includes_lounges_and_current_policies(tmp_path: Path) -> None:
    from datetime import date

    bundle = read_bundle(with_test_lounges(tmp_path))
    due = {d.where: d.status for d in due_for_review(bundle, date(2027, 6, 1))}
    assert due["DEL lounge test-lounge-del-intl"] == "unverified"
    assert due["card test-bank-voyager, domestic policy"] == "outdated"
    assert not any("2025" in w for w in due)  # ended versions aren't re-checked


async def test_lounge_endpoints_503_when_database_is_down() -> None:
    async with make_client(UNREACHABLE_DB) as c:
        assert (await c.get("/api/v1/lounges")).status_code == 503
        r = await c.post(
            "/api/v1/eligibility", json={"cards": ["x"], "airport": "DEL", "scope": "domestic"}
        )
        assert r.status_code == 503


async def test_eligibility_validates_input_without_a_database() -> None:
    async with make_client(UNREACHABLE_DB) as c:
        bad = [
            {"cards": [], "airport": "DEL", "scope": "domestic"},
            {"cards": ["x"], "airport": "DELHI", "scope": "domestic"},
            {"cards": ["Not A Slug"], "airport": "DEL", "scope": "domestic"},
            {"cards": ["x"], "airport": "DEL", "scope": "space"},
            {"cards": ["x"], "airport": "DEL", "scope": "domestic", "card_number": "4111"},
        ]
        for body in bad:
            assert (await c.post("/api/v1/eligibility", json=body)).status_code == 422, body


@pytest.fixture
async def seeded(tmp_path: Path) -> AsyncIterator[httpx.AsyncClient]:
    url = str(get_settings().database_url)
    engine = create_engine(url)
    try:
        async with engine.begin() as conn:
            await apply_bundle(conn, read_bundle(with_test_lounges(tmp_path)))
        async with make_client(url) as c:
            yield c
    finally:
        async with engine.begin() as conn:
            await apply_bundle(conn, read_bundle())
        await engine.dispose()


@pytest.mark.integration
async def test_lounges_and_cards_are_served_with_provenance(seeded: httpx.AsyncClient) -> None:
    listing = (await seeded.get("/api/v1/lounges?airport=del")).json()["items"]
    assert {lg["slug"] for lg in listing} == {"test-lounge-del-t9", "test-lounge-del-intl"}
    t9 = next(lg for lg in listing if lg["slug"] == "test-lounge-del-t9")
    assert t9["programs"] == ["Test Lounge Programme"]

    detail = (await seeded.get("/api/v1/lounges/test-lounge-del-t9")).json()
    assert detail["opening_hours"] == {"mode": "24h", "periods": []}
    assert {a["code"] for a in detail["amenities"]} == {"wifi", "food"}
    assert detail["accepts"][0]["provenance"]["status"] == "verified"
    assert detail["provenance"]["source"]["source_type"] == "lounge_operator"
    assert (await seeded.get("/api/v1/lounges/nope")).status_code == 404

    filtered = (await seeded.get("/api/v1/lounges?program=test-programme")).json()["items"]
    assert [lg["slug"] for lg in filtered] == ["test-lounge-del-t9"]

    cards = (await seeded.get("/api/v1/cards")).json()
    assert [c["slug"] for c in cards["items"]] == ["test-bank-voyager"]
    assert "2 visits a quarter" in cards["items"][0]["domestic"]
    assert len(cards["banks"]) == len(read_bundle().banks.banks) + 1  # every issuer + Test Bank

    card = (await seeded.get("/api/v1/cards/test-bank-voyager")).json()
    assert [p["in_force"] for p in card["policies"]] == [True, False]  # newest first
    assert card["policies"][0]["rules"][2]["type"] == "spend_gate"
    assert (await seeded.get("/api/v1/access-programs")).json()["items"][0][
        "key"
    ] == "test-programme"


@pytest.mark.integration
async def test_eligibility_end_to_end(seeded: httpx.AsyncClient) -> None:
    body = {
        "cards": ["test-bank-voyager", "missing-card"],
        "airport": "DEL",
        "on": "2026-11-20",
        "scope": "domestic",
    }
    r = await seeded.post("/api/v1/eligibility", json=body)
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    out = r.json()
    assert out["unknown_cards"] == ["missing-card"] and out["lounges_listed"] == 2
    by_lounge = {x["lounge"]["slug"]: x for x in out["results"][0]["lounges"]}
    assert by_lounge["test-lounge-del-intl"]["status"] == "no"  # international-only lounge
    t9 = by_lounge["test-lounge-del-t9"]
    assert t9["status"] == "depends"  # spend and visits not given
    assert {c["rule"] for c in t9["checks"] if c["status"] == "depends"} == {
        "spend_gate",
        "visit_quota",
    }

    body["facts"] = {"test-bank-voyager": {"visits_used": 1, "spend_inr": 60000}}
    t9 = next(
        x
        for x in (await seeded.post("/api/v1/eligibility", json=body)).json()["results"][0][
            "lounges"
        ]
        if x["lounge"]["slug"] == "test-lounge-del-t9"
    )
    assert (
        t9["status"] == "yes"
        and t9["via_programs"] == ["test-programme"]
        and t9["entry"] == ["card_swipe"]
    )

    body["facts"] = {"test-bank-voyager": {"visits_used": 2, "spend_inr": 60000}}
    t9 = next(
        x
        for x in (await seeded.post("/api/v1/eligibility", json=body)).json()["results"][0][
            "lounges"
        ]
        if x["lounge"]["slug"] == "test-lounge-del-t9"
    )
    assert t9["status"] == "no"

    # Before the new version: the old policy (8 a year, no spend gate) applies.
    body.update(on="2026-03-01", facts={"test-bank-voyager": {"visits_used": 3}})
    t9 = next(
        x
        for x in (await seeded.post("/api/v1/eligibility", json=body)).json()["results"][0][
            "lounges"
        ]
        if x["lounge"]["slug"] == "test-lounge-del-t9"
    )
    assert t9["status"] == "yes" and "8 visits" in t9["policy_summary"]

    assert (
        await seeded.post("/api/v1/eligibility", json={**body, "airport": "ZZZ"})
    ).status_code == 404
