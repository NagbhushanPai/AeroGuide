"""Eligibility engine: table-driven tests per rule type, plus property-based tests (Hypothesis).

All cards, programmes and lounges here are fictional (test-programme, TST lounge).
"""

from datetime import date, timedelta

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.eligibility.engine import (
    Acceptance,
    Facts,
    Lounge,
    Policy,
    Status,
    Trip,
    evaluate,
)
from app.eligibility.rules import (
    AirportRestriction,
    EntryMethod,
    GuestAllowance,
    ProgramEntitlement,
    Rule,
    SpendGate,
    VisitQuota,
)

D = date(2026, 11, 20)
PROGRAM = ProgramEntitlement(program="test-programme")
LOUNGE = Lounge("tst-lounge", "DEL", "domestic", (Acceptance("test-programme", date(2026, 1, 1)),))
TRIP = Trip(D, "domestic")


def policy(*rules: Rule, scope: str = "domestic", **kw: object) -> Policy:
    base: dict[str, object] = dict(
        id="p1", scope=scope, valid_from=date(2026, 1, 1), valid_to=None, rules=(PROGRAM, *rules)
    )
    base.update(kw)
    return Policy(**base)  # type: ignore[arg-type]


# ------------------------------------------------------------------ table-driven


@pytest.mark.parametrize(
    ("policies", "lounge", "trip", "facts", "expected", "deciding"),
    [
        # access path
        ([policy()], LOUNGE, TRIP, Facts(), Status.YES, "program_entitlement"),
        (
            [policy(rules=(ProgramEntitlement(program="other"),))],
            LOUNGE,
            TRIP,
            Facts(),
            Status.NO,
            "program_entitlement",
        ),
        ([policy(rules=())], LOUNGE, TRIP, Facts(), Status.DEPENDS, "programme"),
        (
            [policy(rules=(ProgramEntitlement(program="test-programme", ambiguous=True),))],
            LOUNGE,
            TRIP,
            Facts(),
            Status.DEPENDS,
            "program_entitlement",
        ),
        # scope
        ([policy()], LOUNGE, Trip(D, "international"), Facts(), Status.NO, "scope"),
        (
            [policy()],
            Lounge("x", "DEL", "both", LOUNGE.accepts),
            Trip(D, "international"),
            Facts(),
            Status.NO,
            "policy",
        ),
        (
            [policy(scope="international")],
            Lounge("x", "DEL", "both", LOUNGE.accepts),
            Trip(D, "international"),
            Facts(),
            Status.YES,
            "program_entitlement",
        ),
        # validity
        ([policy(valid_to=D)], LOUNGE, TRIP, Facts(), Status.NO, "policy"),  # valid_to is exclusive
        ([policy(valid_from=D + timedelta(days=1))], LOUNGE, TRIP, Facts(), Status.NO, "policy"),
        (
            [policy()],
            Lounge("x", "DEL", "domestic", (Acceptance("test-programme", date(2026, 1, 1), D),)),
            TRIP,
            Facts(),
            Status.NO,
            "program_entitlement",
        ),
        # spend gate
        (
            [policy(SpendGate(amount=50_000, window="previous_calendar_quarter"))],
            LOUNGE,
            TRIP,
            Facts(),
            Status.DEPENDS,
            "spend_gate",
        ),
        (
            [policy(SpendGate(amount=50_000, window="previous_calendar_quarter"))],
            LOUNGE,
            TRIP,
            Facts(spend_inr=49_999),
            Status.NO,
            "spend_gate",
        ),
        (
            [policy(SpendGate(amount=50_000, window="previous_calendar_quarter"))],
            LOUNGE,
            TRIP,
            Facts(spend_inr=50_000),
            Status.YES,
            "spend_gate",
        ),
        (
            [policy(SpendGate(amount=50_000, window="previous_billing_quarter", ambiguous=True))],
            LOUNGE,
            TRIP,
            Facts(spend_inr=90_000),
            Status.DEPENDS,
            "spend_gate",
        ),
        # visit quota
        (
            [policy(VisitQuota(count=2, period="quarter"))],
            LOUNGE,
            TRIP,
            Facts(),
            Status.DEPENDS,
            "visit_quota",
        ),
        (
            [policy(VisitQuota(count=2, period="quarter"))],
            LOUNGE,
            TRIP,
            Facts(visits_used=1),
            Status.YES,
            "visit_quota",
        ),
        (
            [policy(VisitQuota(count=2, period="quarter"))],
            LOUNGE,
            TRIP,
            Facts(visits_used=2),
            Status.NO,
            "visit_quota",
        ),
        # airport restriction
        (
            [policy(AirportRestriction(only=["BOM"]))],
            LOUNGE,
            TRIP,
            Facts(),
            Status.NO,
            "airport_restriction",
        ),
        (
            [policy(AirportRestriction(exclude=["DEL"]))],
            LOUNGE,
            TRIP,
            Facts(),
            Status.NO,
            "airport_restriction",
        ),
        (
            [policy(AirportRestriction(only=["DEL"]))],
            LOUNGE,
            TRIP,
            Facts(),
            Status.YES,
            "airport_restriction",
        ),
        # guests
        (
            [policy(GuestAllowance(count=1))],
            LOUNGE,
            Trip(D, "domestic", guests=1),
            Facts(),
            Status.YES,
            "program_entitlement",
        ),
        (
            [policy(GuestAllowance(count=0))],
            LOUNGE,
            Trip(D, "domestic", guests=2),
            Facts(),
            Status.DEPENDS,
            "guest_allowance",
        ),
        # informational and unmodelled
        (
            [policy(EntryMethod(method="card_swipe"))],
            LOUNGE,
            TRIP,
            Facts(),
            Status.YES,
            "program_entitlement",
        ),
        (
            [policy(unmodelled_terms="Primary cardholder only on weekends")],
            LOUNGE,
            TRIP,
            Facts(),
            Status.DEPENDS,
            "terms",
        ),
    ],
)
def test_rule_table(policies, lounge, trip, facts, expected, deciding) -> None:  # type: ignore[no-untyped-def]
    d = evaluate(policies, lounge, trip, facts)
    assert d.status is expected
    assert any(c.rule == deciding for c in d.checks), d.checks
    if expected is not Status.YES:
        assert any(c.status is expected for c in d.checks)


def test_decision_reports_programme_guests_and_entry() -> None:
    d = evaluate([policy(GuestAllowance(count=1), EntryMethod(method="card_swipe"))], LOUNGE, TRIP)
    assert d.status is Status.YES
    assert d.via_programs == ("test-programme",)
    assert d.guests_covered == 1 and d.entry == ("card_swipe",)
    assert d.policy_id == "p1"


def test_the_version_in_force_on_the_trip_date_is_used() -> None:
    old = policy(VisitQuota(count=8, period="year"), id="old", valid_to=date(2026, 7, 1))
    new = policy(VisitQuota(count=2, period="year"), id="new", valid_from=date(2026, 7, 1))
    assert (
        evaluate(
            [old, new], LOUNGE, Trip(date(2026, 3, 1), "domestic"), Facts(visits_used=3)
        ).status
        is Status.YES
    )
    later = evaluate([old, new], LOUNGE, TRIP, Facts(visits_used=3))
    assert later.status is Status.NO and later.policy_id == "new"


# ------------------------------------------------------------------ property-based

rules_strategy = st.lists(
    st.one_of(
        st.builds(
            SpendGate,
            amount=st.integers(1, 500_000),
            window=st.just("previous_calendar_quarter"),
            ambiguous=st.booleans(),
        ),
        st.builds(
            VisitQuota,
            count=st.integers(1, 12),
            period=st.sampled_from(["month", "quarter", "year"]),
            ambiguous=st.booleans(),
        ),
        st.builds(GuestAllowance, count=st.integers(0, 3)),
        st.builds(AirportRestriction, only=st.lists(st.sampled_from(["DEL", "BOM"]), max_size=2)),
        st.builds(EntryMethod, method=st.just("card_swipe")),
    ),
    max_size=4,
)
RANK = {Status.NO: 0, Status.DEPENDS: 1, Status.YES: 2}


@given(
    rules=rules_strategy,
    spend=st.integers(0, 600_000),
    extra=st.integers(1, 300_000),
    used=st.none() | st.integers(0, 20),
)
def test_more_spend_never_makes_it_worse(
    rules: list[Rule], spend: int, extra: int, used: int | None
) -> None:
    p = [policy(*rules)]
    low = evaluate(p, LOUNGE, TRIP, Facts(visits_used=used, spend_inr=spend))
    high = evaluate(p, LOUNGE, TRIP, Facts(visits_used=used, spend_inr=spend + extra))
    assert RANK[high.status] >= RANK[low.status]


@given(
    rules=rules_strategy,
    used=st.integers(0, 20),
    more=st.integers(1, 10),
    spend=st.none() | st.integers(0, 600_000),
)
def test_using_more_visits_never_makes_it_better(
    rules: list[Rule], used: int, more: int, spend: int | None
) -> None:
    p = [policy(*rules)]
    before = evaluate(p, LOUNGE, TRIP, Facts(visits_used=used, spend_inr=spend))
    after = evaluate(p, LOUNGE, TRIP, Facts(visits_used=used + more, spend_inr=spend))
    assert RANK[after.status] <= RANK[before.status]


@given(rules=rules_strategy, offset=st.integers(-400, 400), length=st.integers(1, 400))
def test_policy_outside_its_window_never_applies(
    rules: list[Rule], offset: int, length: int
) -> None:
    start = D + timedelta(days=offset)
    p = [policy(*rules, valid_from=start, valid_to=start + timedelta(days=length))]
    d = evaluate(p, LOUNGE, TRIP, Facts(visits_used=0, spend_inr=10**9))
    if not (start <= D < start + timedelta(days=length)):
        assert d.status is Status.NO and d.policy_id is None


@given(
    rules=rules_strategy,
    spend=st.none() | st.integers(0, 600_000),
    used=st.none() | st.integers(0, 20),
)
def test_ambiguous_rules_never_give_a_plain_yes(
    rules: list[Rule], spend: int | None, used: int | None
) -> None:
    d = evaluate([policy(*rules)], LOUNGE, TRIP, Facts(visits_used=used, spend_inr=spend))
    if any(r.ambiguous for r in rules if not isinstance(r, (GuestAllowance, EntryMethod))):
        assert d.status is not Status.YES


@given(
    rules=rules_strategy,
    spend=st.none() | st.integers(0, 600_000),
    used=st.none() | st.integers(0, 20),
)
def test_every_non_yes_answer_names_its_reason(
    rules: list[Rule], spend: int | None, used: int | None
) -> None:
    d = evaluate([policy(*rules)], LOUNGE, TRIP, Facts(visits_used=used, spend_inr=spend))
    if d.status is not Status.YES:
        assert any(c.status is d.status for c in d.checks)
