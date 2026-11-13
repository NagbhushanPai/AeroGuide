"""Lounge policy rule types (ADR-0009). A fixed set, each with typed fields.

Anything a bank writes that doesn't fit one of these is kept as quoted text on the policy
(`unmodelled_terms`) and makes the checker answer "depends", never a guess.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

ProgramKey = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
Iata = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
Period = Literal["month", "quarter", "year"]
SpendWindow = Literal[
    "previous_month",
    "previous_calendar_quarter",
    "previous_billing_quarter",
    "previous_year",
    "current_year",
]


class _Rule(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    # The bank's wording leaves room for more than one reading (for example "previous quarter"
    # without saying calendar or billing). An ambiguous rule can never produce a plain "yes".
    ambiguous: bool = False
    note: str | None = None


class ProgramEntitlement(_Rule):
    """The card gives access through this programme (for example a network lounge programme)."""

    type: Literal["program_entitlement"] = "program_entitlement"
    program: ProgramKey


class VisitQuota(_Rule):
    type: Literal["visit_quota"] = "visit_quota"
    count: int = Field(ge=1, le=100)
    period: Period


class SpendGate(_Rule):
    type: Literal["spend_gate"] = "spend_gate"
    amount: int = Field(gt=0, description="Minimum spend, in whole rupees")
    currency: Literal["INR"] = "INR"
    window: SpendWindow


class GuestAllowance(_Rule):
    type: Literal["guest_allowance"] = "guest_allowance"
    count: int = Field(ge=0, le=20)
    period: Period | None = None


class AirportRestriction(_Rule):
    type: Literal["airport_restriction"] = "airport_restriction"
    only: list[Iata] = []
    exclude: list[Iata] = []


class EntryMethod(_Rule):
    """How to get in. Informational: shown with the answer, never changes it."""

    type: Literal["entry_method"] = "entry_method"
    method: Literal["card_swipe", "programme_card", "app_pass", "voucher", "other"]


Rule = Annotated[
    ProgramEntitlement | VisitQuota | SpendGate | GuestAllowance | AirportRestriction | EntryMethod,
    Field(discriminator="type"),
]
RULE_TYPES = (
    "program_entitlement",
    "visit_quota",
    "spend_gate",
    "guest_allowance",
    "airport_restriction",
    "entry_method",
)
