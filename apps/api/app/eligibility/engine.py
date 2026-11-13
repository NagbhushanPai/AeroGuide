"""Deterministic lounge eligibility (ADR-0009). Pure functions, no I/O, no AI.

    evaluate(policies, lounge, trip, facts) -> Decision

Answers are "yes", "no" or "depends", and every answer lists the checks that produced it,
each tied to a rule, so the UI can show exactly why. Combining checks:

    any "no"      -> no
    any "depends" -> depends   (missing facts, ambiguous wording, unmodelled terms)
    otherwise     -> yes

Properties the tests hold this to (tests/test_eligibility.py):
  - more spend never turns yes into no; more visits used never turns no into yes
  - a policy outside its validity window never applies
  - an ambiguous rule never yields a plain yes
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from typing import Literal

from app.eligibility.rules import (
    AirportRestriction,
    EntryMethod,
    GuestAllowance,
    ProgramEntitlement,
    Rule,
    SpendGate,
    VisitQuota,
)

FlightScope = Literal["domestic", "international"]
LoungeScope = Literal["domestic", "international", "both"]


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
    rule: str  # rule type, or "scope", "policy", "programme", "terms"
    status: Status
    message: str


@dataclass(frozen=True, slots=True)
class Decision:
    status: Status
    checks: tuple[Check, ...]
    policy_id: str | None = None
    via_programs: tuple[str, ...] = ()
    guests_covered: int | None = None  # None = the policy doesn't say
    entry: tuple[str, ...] = field(default=())


def _combine(checks: Sequence[Check]) -> Status:
    if any(c.status is Status.NO for c in checks):
        return Status.NO
    if any(c.status is Status.DEPENDS for c in checks):
        return Status.DEPENDS
    return Status.YES


def _rupees(amount: int) -> str:
    return f"₹{amount:,}"


def evaluate(
    policies: Sequence[Policy], lounge: Lounge, trip: Trip, facts: Facts | None = None
) -> Decision:
    facts = facts or Facts()

    if lounge.scope != "both" and lounge.scope != trip.scope:
        return Decision(
            Status.NO,
            (Check("scope", Status.NO, f"This lounge serves {lounge.scope} departures only."),),
        )

    in_force = [p for p in policies if p.scope == trip.scope and p.in_force(trip.on)]
    if not in_force:
        return Decision(
            Status.NO,
            (
                Check(
                    "policy",
                    Status.NO,
                    f"No {trip.scope} lounge benefit is recorded for this card on "
                    f"{trip.on.isoformat()}.",
                ),
            ),
        )
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
    elif not via:
        checks.append(
            Check(
                "program_entitlement",
                Status.NO,
                "This lounge doesn't accept the card's lounge programme"
                + (" (" + ", ".join(programs) + ")." if programs else "."),
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
                "Accepted through " + ", ".join(via) + ".",
            )
        )

    guests_covered: int | None = None
    entry: list[str] = []
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
            if trip.guests > rule.count:
                checks.append(
                    Check(
                        rule.type,
                        Status.DEPENDS,
                        f"Covers {rule.count} guest(s); the others would pay.",
                    )
                )
        elif isinstance(rule, EntryMethod):
            entry.append(rule.method)

    if policy.unmodelled_terms:
        checks.append(
            Check(
                "terms",
                Status.DEPENDS,
                f"The bank's terms include conditions we can't check: {policy.unmodelled_terms}",
            )
        )

    return Decision(
        _combine(checks),
        tuple(checks),
        policy_id=policy.id,
        via_programs=via,
        guests_covered=guests_covered,
        entry=tuple(entry),
    )


def _maybe_ambiguous(rule: Rule, message: str) -> Check:
    if rule.ambiguous:
        return Check(rule.type, Status.DEPENDS, f"{message} The bank's wording is unclear here.")
    return Check(rule.type, Status.YES, message)


def _spend(rule: SpendGate, facts: Facts) -> Check:
    need = f"Needs {_rupees(rule.amount)} spent in the {rule.window.replace('_', ' ')}."
    if facts.spend_inr is None:
        return Check(rule.type, Status.DEPENDS, need)
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
