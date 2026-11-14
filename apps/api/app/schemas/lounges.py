"""Lounge, card and eligibility API shapes. Every fact-bearing object carries provenance."""

from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.airports import Provenance

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=80)]
Status = Literal["yes", "no", "depends"]


class ProgramRef(BaseModel):
    key: str
    name: str
    kind: str
    url: str | None


class Acceptance(BaseModel):
    program: ProgramRef
    paid_price: float | None
    currency: str | None
    paid_duration_min: int | None
    valid_from: date
    valid_to: date | None
    provenance: Provenance


class AmenityRef(BaseModel):
    code: str
    label: str


class LoungeSummary(BaseModel):
    slug: str
    name: str
    iata: str
    terminal: str | None
    scope: Literal["domestic", "international", "both"]
    side: Literal["airside", "landside"]
    status: str = Field(description="Verification status of the lounge record")
    programs: list[str] = Field(description="Names of programmes accepted today")


class LoungeList(BaseModel):
    items: list[LoungeSummary]


class LoungeDetail(LoungeSummary):
    airport_name: str
    operator: str | None
    location_text: str | None
    nearest_gate: str | None
    opening_hours: dict[str, Any] | None = Field(
        description="{mode: 24h} or {mode: weekly, periods: [...]}; null means not verified"
    )
    amenities: list[AmenityRef] = Field(description="Only what the source states")
    accepts: list[Acceptance]
    provenance: Provenance


class BankRef(BaseModel):
    slug: str
    name: str
    url: str


class CardSummary(BaseModel):
    slug: str
    name: str
    bank: BankRef
    network: str | None = Field(description="Null when the bank doesn't state the network")
    status: str
    domestic: str | None = Field(description="Summary of the domestic benefit in force today")
    international: str | None


class CardList(BaseModel):
    items: list[CardSummary]
    banks: list[BankRef]


class PolicyOut(BaseModel):
    scope: Literal["domestic", "international"]
    valid_from: date
    valid_to: date | None
    in_force: bool
    summary: str
    rules: list[dict[str, Any]]
    unmodelled_terms: str | None
    provenance: Provenance


class CardDetail(CardSummary):
    product_url: str
    provenance: Provenance
    policies: list[PolicyOut] = Field(description="Every version, newest first")


class ProgramList(BaseModel):
    items: list[ProgramRef]


class CardFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visits_used: int | None = Field(default=None, ge=0, le=100)
    spend_inr: int | None = Field(default=None, ge=0, le=100_000_000)


class EligibilityRequest(BaseModel):
    """Nothing here is stored. No card numbers: only which card products you hold."""

    # Unknown fields are refused, so nothing else (a card number, say) can ride along.
    model_config = ConfigDict(extra="forbid")

    cards: list[Slug] = Field(min_length=1, max_length=10)
    airport: Annotated[str, StringConstraints(pattern=r"^[A-Za-z]{3}$")]
    on: date | None = Field(default=None, description="Travel date; default today (IST)")
    scope: Literal["domestic", "international"]
    guests: int = Field(default=0, ge=0, le=10)
    facts: dict[str, CardFacts] = Field(default_factory=dict, description="Keyed by card slug")


class CheckOut(BaseModel):
    rule: str
    status: Status
    message: str


class LoungeResult(BaseModel):
    lounge: LoungeSummary
    status: Status
    checks: list[CheckOut]
    via_programs: list[str]
    guests_covered: int | None
    entry: list[str]
    policy_summary: str | None


class CardResult(BaseModel):
    card: CardSummary
    lounges: list[LoungeResult]


class EligibilityResponse(BaseModel):
    airport: str
    on: date
    scope: Literal["domestic", "international"]
    lounges_listed: int = Field(description="Lounges we have records for at this airport")
    results: list[CardResult]
    unknown_cards: list[str]
    disclaimer: str
