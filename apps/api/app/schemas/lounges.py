"""Lounge, card and eligibility API shapes. Every fact-bearing object carries provenance."""

from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.airports import DisplayStatus, Provenance

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
    in_force: bool
    provenance: Provenance


class ProgramBrief(BaseModel):
    key: str
    name: str


class AmenityRef(BaseModel):
    code: str
    label: str


class LoungeSummary(BaseModel):
    slug: str
    name: str
    iata: str
    airport_name: str
    city: str | None
    terminal: str | None
    scope: Literal["domestic", "international", "both"]
    side: Literal["airside", "landside"]
    direction: Literal["departures", "arrivals", "transit"]
    status: DisplayStatus = Field(description="Verification status of the lounge record")
    programs: list[ProgramBrief] = Field(description="Programmes accepted today")


class LoungeList(BaseModel):
    items: list[LoungeSummary]


class LoungeDetail(LoungeSummary):
    operator: str | None
    location_text: str | None
    nearest_gate: str | None
    opening_hours: dict[str, Any] | None = Field(
        description="{mode: 24h} or {mode: weekly, periods: [...]}; null means not verified"
    )
    amenities: list[AmenityRef] = Field(description="Only what the source states")
    accepts: list[Acceptance]
    cards: list["CardAccess"] = Field(
        description="Cards whose benefit in force today names a programme this lounge accepts "
        "today. Conditions (spend, visits) still apply: use /eligibility for an answer."
    )
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
    status: DisplayStatus
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
    programs: list["ScopePrograms"] = Field(
        description="Programmes the benefits in force today name, per scope"
    )


class CardAccess(BaseModel):
    """A card that may get into a lounge (through the programme named)."""

    slug: str
    name: str
    bank: str
    status: DisplayStatus
    scope: Literal["domestic", "international"]
    via: ProgramBrief


class ScopePrograms(BaseModel):
    scope: Literal["domestic", "international"]
    programs: list[ProgramBrief]
    lounge_list_known: bool = Field(
        description="False when we have no lounges recorded for these programmes"
    )


class CardLounges(BaseModel):
    """Lounges accepting the programmes a card's benefits name today. Conditions still apply."""

    card: str
    scopes: list[ScopePrograms]
    lounges: list[LoungeSummary]


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
    facts: dict[Slug, CardFacts] = Field(
        default_factory=dict, max_length=10, description="Keyed by card slug"
    )


class CheckOut(BaseModel):
    rule: str
    status: Status
    message: str
    detail: str | None = Field(default=None, description="Quoted bank wording behind the check")


class LoungeResult(BaseModel):
    lounge: LoungeSummary
    status: Status
    checks: list[CheckOut]
    via_programs: list[str]
    guests_covered: int | None
    entry: list[str]
    notes: list[str] = Field(description="Informational: fees, add-on cardholders")
    policy_summary: str | None


class CardResult(BaseModel):
    card: CardSummary
    lounges: list[LoungeResult]


class EligibilityResponse(BaseModel):
    airport: str
    on: date
    scope: Literal["domestic", "international"]
    lounges_listed: int = Field(description="Departure lounges we have records for at this airport")
    results: list[CardResult]
    unknown_cards: list[str]
    disclaimer: str


class SearchHit(BaseModel):
    kind: Literal["airport", "lounge", "card"]
    key: str = Field(description="IATA code or slug")
    title: str
    subtitle: str | None
    href: str = Field(description="Path on the website")


class SearchResults(BaseModel):
    q: str
    items: list[SearchHit]


LoungeDetail.model_rebuild()
CardDetail.model_rebuild()
