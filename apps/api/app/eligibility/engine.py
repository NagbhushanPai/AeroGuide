"""Deterministic lounge eligibility (ADR-0009). Pure functions, no I/O, no AI.

    evaluate(policies, lounge, trip, facts) -> Decision

Answers are "yes", "no" or "depends", and every answer lists the checks that produced it,
each tied to a rule, so the UI can show exactly why. Combining checks:

    any "no"      -> no       (only the "no" checks are returned: they are the reason)
    any "depends" -> depends  (missing facts, ambiguous wording, unmodelled terms)
    otherwise     -> yes

Missing data is never a "no": a card with no recorded benefit for the scope, a programme
whose lounge list we don't have, or guests the terms don't mention all give "depends".

Properties the tests hold this to (tests/test_eligibility.py):
  - more spend never turns yes into no; more visits used never turns no into yes
  - a policy outside its validity window never applies
  - an ambiguous rule never yields a plain yes
  - informational rules (entry method, fees, add-on cardholders) never change the answer
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from typing import Literal

from app.eligibility.rules import (
    AddOnCardholders,
    AirportRestriction,
    EntryMethod,
    Fee,
    GuestAllowance,
    ProgramEntitlement,
    Rule,
    SpendGate,
    VisitQuota,
)

FlightScope = Literal["domestic", "international"]
LoungeScope = Literal["domestic", "international", "both"]
Direction = Literal["departures", "arrivals", "transit"]


class Status(StrEnum):
    YES = "yes"
    NO = "no"
    DEPENDS = "depends"


@dataclass(frozen=True, slots=True)
class Policy:
    id: str
    scope: FlightScope
    valid_from: date
    valid_to: date | None  # exclusive; None = current
    rules: tuple[Rule, ...]
    # Bank wording that no rule type captures. Its presence always means "depends".
    unmodelled_terms: str | None = None

    def in_force(self, on: date) -> bool:
        return self.valid_from <= on and (self.valid_to is None or on < self.valid_to)


@dataclass(frozen=True, slots=True)
class Acceptance:
    """The lounge accepts this programme over a validity window."""

    program: str
    valid_from: date
    valid_to: date | None = None

    def in_force(self, on: date) -> bool:
        return self.valid_from <= on and (self.valid_to is None or on < self.valid_to)


@dataclass(frozen=True, slots=True)
class Lounge:
    slug: str
    iata: str
    scope: LoungeScope
    accepts: tuple[Acceptance, ...]
    direction: Direction = "departures"


@dataclass(frozen=True, slots=True)
class Trip:
    on: date
    scope: FlightScope
    guests: int = 0


@dataclass(frozen=True, slots=True)
class Facts:
    """What the traveller tells us. None = not told, which leads to "depends"."""

    visits_used: int | None = None  # in the policy's current quota period
    spend_inr: int | None = None  # in the policy's spend window


@dataclass(frozen=True, slots=True)
class Check:
    rule: str  # rule type, or "scope", "direction", "policy", "programme", "terms", "guests"
    status: Status
    message: str
    # Quoted bank wording behind the check, for the UI to show on request.
    detail: str | None = None


@dataclass(frozen=True, slots=True)
class Decision:
    status: Status
    checks: tuple[Check, ...]
    policy_id: str | None = None
    via_programs: tuple[str, ...] = ()
    guests_covered: int | None = None  # None = the policy doesn't say
    entry: tuple[str, ...] = field(default=())
    # Informational: fees, add-on cardholders. Never change the status.
    notes: tuple[str, ...] = ()


def _combine(checks: Sequence[Check]) -> Status:
    if any(c.status is Status.NO for c in checks):
        return Status.NO
    if any(c.status is Status.DEPENDS for c in checks):
        return Status.DEPENDS
    return Status.YES


def _money(amount: float, currency: str = "INR") -> str:
    whole = int(amount) if float(amount).is_integer() else amount
    if currency == "INR":
        return f"₹{whole:,}"
    return f"{currency} {whole:,}"


def _rupees(amount: int) -> str:
    return _money(amount)


def _no_policy(policies: Sequence[Policy], trip: Trip) -> Decision:
    same_scope = [p for p in policies if p.scope == trip.scope]
    ended = [p for p in same_scope if p.valid_to is not None and p.valid_to <= trip.on]
    later = [p for p in same_scope if p.valid_from > trip.on]
    if ended and not later:
        last = max(p.valid_to for p in ended if p.valid_to is not None)
        return Decision(
            Status.NO,
            (
                Check(
                    "policy",
                    Status.NO,
                    f"The card's {trip.scope} lounge benefit ended on {last.isoformat()}.",
                ),
            ),
        )
    if later:
        first = min(p.valid_from for p in later)
        message = (
            f"We have no record of the card's {trip.scope} lounge benefit before "
            f"{first.isoformat()}. Check with the bank."
        )
    else:
        message = (
            f"We have no record of a {trip.scope} lounge benefit for this card. That doesn't "
            "mean there isn't one: check with the bank."
        )
    return Decision(Status.DEPENDS, (Check("policy", Status.DEPENDS, message),))


def evaluate(
    policies: Sequence[Policy],
    lounge: Lounge,
    trip: Trip,
    facts: Facts | None = None,
    mapped_programs: frozenset[str] | None = None,
    program_names: Mapping[str, str] | None = None,
) -> Decision:
    """`mapped_programs`: programmes some lounge records accepting (today). A programme
    outside this set has no known lounge list, so "not accepted here" becomes "depends", not
    "no". None means every programme's lounges are known.
    `program_names`: display names for programme keys, used in messages."""
    facts = facts or Facts()
    names = program_names or {}

    def label(keys: Sequence[str]) -> str:
        return ", ".join(names.get(k, k) for k in keys)

    if lounge.direction != "departures":
        return Decision(
            Status.NO,
            (
                Check(
                    "direction",
                    Status.NO,
                    f"This is an {lounge.direction} lounge, not one for departing passengers.",
                ),
            ),
        )
    if lounge.scope != "both" and lounge.scope != trip.scope:
        return Decision(
            Status.NO,
            (Check("scope", Status.NO, f"This lounge serves {lounge.scope} departures only."),),
        )

    in_force = [p for p in policies if p.scope == trip.scope and p.in_force(trip.on)]
    if not in_force:
        return _no_policy(policies, trip)
    # Seed validation forbids overlapping versions, so at most one policy is in force.
    policy = in_force[0]
    checks: list[Check] = []

    programs = [r.program for r in policy.rules if isinstance(r, ProgramEntitlement)]
    accepted = {a.program for a in lounge.accepts if a.in_force(trip.on)}
    via = tuple(p for p in programs if p in accepted)
    if not programs:
        checks.append(
            Check(
                "programme",
                Status.DEPENDS,
                "The bank doesn't name a lounge programme, so we can't match it to this lounge.",
            )
        )
    elif not via and mapped_programs is not None and not set(programs) <= mapped_programs:
        checks.append(
            Check(
                "program_entitlement",
                Status.DEPENDS,
                f"We don't have the list of lounges for {label(programs)} yet, so we can't tell "
                "whether this lounge is on it. Check the bank's lounge list.",
            )
        )
    elif not via:
        checks.append(
            Check(
                "program_entitlement",
                Status.NO,
                f"This lounge isn't on the {label(programs)} list.",
            )
        )
    else:
        ambiguous = any(
            isinstance(r, ProgramEntitlement) and r.program in via and r.ambiguous
            for r in policy.rules
        )
        checks.append(
            Check(
                "program_entitlement",
                Status.DEPENDS if ambiguous else Status.YES,
                f"Accepted through {label(via)}."
                + (" The bank's wording about the programme is unclear." if ambiguous else ""),
            )
        )

    guests_covered: int | None = None
    guest_fee: Fee | None = None
    entry: list[str] = []
    notes: list[str] = []
    for rule in policy.rules:
        if isinstance(rule, AirportRestriction):
            if (rule.only and lounge.iata not in rule.only) or lounge.iata in rule.exclude:
                checks.append(
                    Check(rule.type, Status.NO, f"The benefit doesn't cover {lounge.iata}.")
                )
            else:
                checks.append(_maybe_ambiguous(rule, f"{lounge.iata} is covered."))
        elif isinstance(rule, SpendGate):
            checks.append(_spend(rule, facts))
        elif isinstance(rule, VisitQuota):
            checks.append(_quota(rule, facts))
        elif isinstance(rule, GuestAllowance):
            guests_covered = rule.count
        elif isinstance(rule, EntryMethod):
            entry.append(rule.method)
        elif isinstance(rule, Fee):
            if rule.applies_to == "guest":
                guest_fee = rule
            notes.append(_fee_note(rule))
        elif isinstance(rule, AddOnCardholders):
            notes.append(_add_on_note(rule))

    if trip.guests > 0:
        checks.extend(_guests(trip.guests, guests_covered, guest_fee))

    if policy.unmodelled_terms:
        checks.append(
            Check(
                "terms",
                Status.DEPENDS,
                "The bank's terms include conditions we can't check.",
                detail=policy.unmodelled_terms,
            )
        )

    status = _combine(checks)
    if status is Status.NO:
        # The "no" is the answer; the other checks would only distract from it.
        checks = [c for c in checks if c.status is Status.NO]
    return Decision(
        status,
        tuple(checks),
        policy_id=policy.id,
        via_programs=via,
        guests_covered=guests_covered,
        entry=tuple(entry),
        notes=tuple(notes),
    )


def _guests(guests: int, covered: int | None, fee: Fee | None) -> list[Check]:
    if covered is not None:
        if guests <= covered:
            return [Check("guest_allowance", Status.YES, f"Covers {covered} guest(s).")]
        pay = f" at {_money(fee.amount, fee.currency)} each" if fee else ""
        return [
            Check(
                "guest_allowance",
                Status.DEPENDS,
                f"Covers {covered} guest(s); the others would pay{pay}.",
            )
        ]
    if fee is not None:
        # Guests pay a stated fee: the cardholder's own answer doesn't change.
        return [
            Check(
                "guests",
                Status.YES,
                f"Guests pay {_money(fee.amount, fee.currency)} each.",
            )
        ]
    return [
        Check(
            "guests",
            Status.DEPENDS,
            "The bank's terms don't say whether guests are covered. Expect to pay for them.",
        )
    ]


def _fee_note(rule: Fee) -> str:
    who = "Each guest is charged" if rule.applies_to == "guest" else "Each visit is charged"
    refund = {True: " (refunded)", False: " (not refunded)", None: ""}[rule.refundable]
    return f"{who} {_money(rule.amount, rule.currency)}{refund}."


def _add_on_note(rule: AddOnCardholders) -> str:
    if not rule.covered:
        return "Add-on cardholders aren't covered."
    if rule.shares_quota is True:
        return "Add-on cardholders are covered and share the primary card's visits."
    if rule.shares_quota is False:
        return "Add-on cardholders are covered with their own visits."
    return "Add-on cardholders are covered."


def _maybe_ambiguous(rule: Rule, message: str) -> Check:
    if rule.ambiguous:
        return Check(rule.type, Status.DEPENDS, f"{message} The bank's wording is unclear here.")
    return Check(rule.type, Status.YES, message)


def _window(window: str) -> str:
    return window.replace("_", " ")


def _spend(rule: SpendGate, facts: Facts) -> Check:
    need = f"Needs {_rupees(rule.amount)} spent in the {_window(rule.window)}."
    if facts.spend_inr is None:
        return Check(rule.type, Status.DEPENDS, f"{need} Enter your spend to check.")
    if facts.spend_inr < rule.amount:
        if rule.ambiguous:
            # The traveller may have measured a different window than the bank means.
            return Check(rule.type, Status.DEPENDS, f"{need} Which period counts is unclear.")
        return Check(rule.type, Status.NO, f"{need} You entered {_rupees(facts.spend_inr)}.")
    return _maybe_ambiguous(rule, f"{need} Met.")


def _quota(rule: VisitQuota, facts: Facts) -> Check:
    limit = f"{rule.count} visit(s) per {rule.period}."
    if facts.visits_used is None:
        return Check(rule.type, Status.DEPENDS, f"{limit} Depends on visits already used.")
    if facts.visits_used >= rule.count:
        if rule.ambiguous:
            return Check(rule.type, Status.DEPENDS, f"{limit} Which period counts is unclear.")
        return Check(rule.type, Status.NO, f"{limit} All used.")
    left = rule.count - facts.visits_used
    return _maybe_ambiguous(rule, f"{limit} {left} left.")
