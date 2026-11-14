"""Shapes of the YAML seed files in apps/api/data (ADR-0007). Rules within one record live here;
rules across files (does a source key exist?) live in bundle.validate_bundle."""

from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, model_validator

from app.core.india import today_ist
from app.eligibility.rules import Rule
from app.models.enums import AirlineOperation, SourceType, TerminalRole, VerificationStatus

Key = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
Iata = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
Icao = Annotated[str, StringConstraints(pattern=r"^[A-Z]{4}$")]
AirlineIcao = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
AirlineIata = Annotated[str, StringConstraints(pattern=r"^[A-Z0-9]{2}$")]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SourceIn(Strict):
    key: Key
    name: Text
    url: HttpUrl
    publisher: Text | None = None
    source_type: SourceType
    retrieved_at: date
    archived_url: HttpUrl | None = None


class SourcesFile(Strict):
    sources: list[SourceIn]


class ProvenanceIn(Strict):
    """ADR-0006. A verified fact names its source, the date it was checked and who checked it."""

    status: VerificationStatus = VerificationStatus.UNVERIFIED
    source: Key | None = None
    verified_at: date | None = None
    verified_by: Text | None = None
    reverify_after_days: int | None = Field(default=None, ge=1, le=730)
    notes: Text | None = None

    @model_validator(mode="after")
    def verified_needs_evidence(self) -> Self:
        if self.status is VerificationStatus.VERIFIED:
            missing = [
                name
                for name in ("source", "verified_at", "verified_by")
                if getattr(self, name) is None
            ]
            if missing:
                raise ValueError(f"a verified record needs {', '.join(missing)}")
        if self.verified_at is not None and self.verified_at > today_ist():
            raise ValueError("verified_at is in the future")
        return self


class AirportIn(Strict):
    iata: Iata
    icao: Icao | None
    name: Text
    city: Text | None
    state_code: Annotated[str, StringConstraints(pattern=r"^IN-[A-Z]{2}$")]
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    elevation_ft: int | None
    size: Annotated[str, StringConstraints(pattern=r"^(large|medium|small)$")]


class AirportsFile(Strict):
    """Generated geodata (scripts/build_airport_data.py). One source for every row."""

    source: Key
    retrieved_at: date
    airports: list[AirportIn]


class OsmTerminalIn(Strict):
    iata: Iata
    osm: Annotated[str, StringConstraints(pattern=r"^(node|way|relation)/[0-9]+$")]
    name: Text
    ref: Text | None = None
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class OsmTerminalsFile(Strict):
    """Generated (scripts/build_osm_terminals.py). One source for every row."""

    source: Key
    retrieved_at: date
    terminals: list[OsmTerminalIn]


class AirlineIn(Strict):
    icao: AirlineIcao
    iata: AirlineIata | None = None
    name: Text
    callsign: Text | None = None
    country_iso: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")] | None = None


class AirlinesFile(Strict):
    airlines: list[AirlineIn]


class TerminalAirlineIn(Strict):
    airline: AirlineIcao
    operation: AirlineOperation
    # Copied from the source's wording, for example "flights 6E 2000-2999 only". Never inferred.
    scope_note: Text | None = None
    valid_from: date
    valid_to: date | None = None
    provenance: ProvenanceIn

    @model_validator(mode="after")
    def valid_range(self) -> Self:
        if self.valid_to is not None and self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be after valid_from")
        return self


class TerminalIn(Strict):
    code: Annotated[str, StringConstraints(pattern=r"^[A-Z0-9-]{1,8}$")]
    name: Text
    role: TerminalRole
    provenance: ProvenanceIn
    airlines: list[TerminalAirlineIn] = []


class GuideFile(Strict):
    iata: Iata
    official_source: Key | None = None
    terminals: list[TerminalIn] = []


# ---------------------------------------------------------------- lounges and cards (Stage 5)

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
Hhmm = Annotated[str, StringConstraints(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")]
Day = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class AmenityIn(Strict):
    code: Annotated[str, StringConstraints(pattern=r"^[a-z_]+$")]
    label: Text


class AmenitiesFile(Strict):
    amenities: list[AmenityIn]


class CardNetworkIn(Strict):
    code: Annotated[str, StringConstraints(pattern=r"^[a-z]+$")]
    name: Text


class CardNetworksFile(Strict):
    card_networks: list[CardNetworkIn]


class BankIn(Strict):
    slug: Slug
    name: Text
    url: HttpUrl


class BanksFile(Strict):
    banks: list[BankIn]


class AccessProgramIn(Strict):
    key: Key
    name: Text
    kind: Literal["membership", "network", "bank", "airline", "paid"]
    url: HttpUrl | None = None


class AccessProgramsFile(Strict):
    programs: list[AccessProgramIn]


class HoursPeriod(Strict):
    days: list[Day] = Field(min_length=1)
    open: Hhmm
    close: Hhmm  # may be earlier than open: the period runs past midnight


class OpeningHours(Strict):
    mode: Literal["24h", "weekly"]
    periods: list[HoursPeriod] = []

    @model_validator(mode="after")
    def periods_match_mode(self) -> Self:
        if self.mode == "24h" and self.periods:
            raise ValueError("24h opening hours take no periods")
        if self.mode == "weekly" and not self.periods:
            raise ValueError("weekly opening hours need at least one period")
        return self


class AcceptanceIn(Strict):
    """The lounge accepts this programme. A fact about the lounge, from its operator."""

    program: Key
    valid_from: date
    valid_to: date | None = None
    paid_price: float | None = Field(default=None, ge=0)
    currency: Literal["INR", "USD"] | None = None
    paid_duration_min: int | None = Field(default=None, ge=1, le=1440)
    provenance: ProvenanceIn

    @model_validator(mode="after")
    def check(self) -> Self:
        if self.valid_to is not None and self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be after valid_from")
        if (self.paid_price is None) != (self.currency is None):
            raise ValueError("paid_price and currency go together")
        return self


class LoungeIn(Strict):
    slug: Slug
    name: Text
    terminal: Text | None = None  # as the source names it, for example "T3"
    operator: Text | None = None
    scope: Literal["domestic", "international", "both"]
    side: Literal["airside", "landside"]
    # Arrivals and transit lounges aren't offered to departing passengers by the checker.
    direction: Literal["departures", "arrivals", "transit"] = "departures"
    location_text: Text | None = None  # quoted from the source
    nearest_gate: Text | None = None  # only when the source states it
    opening_hours: OpeningHours | None = None  # None = not verified
    amenities: list[str] = []
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    provenance: ProvenanceIn
    accepts: list[AcceptanceIn] = []

    @model_validator(mode="after")
    def coordinates_together(self) -> Self:
        if (self.lat is None) != (self.lon is None):
            raise ValueError("lat and lon go together")
        return self


class LoungesFile(Strict):
    iata: Iata
    lounges: list[LoungeIn]


class PolicyIn(Strict):
    """One version of a card's lounge benefit. Add a version; never rewrite a past one."""

    scope: Literal["domestic", "international"]
    valid_from: date
    valid_to: date | None = None
    summary: Text
    rules: list[Rule] = []
    unmodelled_terms: Text | None = None
    provenance: ProvenanceIn

    @model_validator(mode="after")
    def valid_range(self) -> Self:
        if self.valid_to is not None and self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be after valid_from")
        return self


class CardFile(Strict):
    slug: Slug
    bank: Slug
    # None when the bank's pages don't say which network the card runs on.
    network: Annotated[str, StringConstraints(pattern=r"^[a-z]+$")] | None = None
    name: Text
    product_url: HttpUrl
    provenance: ProvenanceIn
    policies: list[PolicyIn] = []
