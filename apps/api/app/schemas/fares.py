"""Fare search shapes (ADR-0015): the request, the normalised offer every provider maps to,
and the response. Provider-specific fields never leak past the adapters."""

from datetime import date, datetime, timedelta
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.india import today_ist

Iata = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
AirlineCode = Annotated[str, StringConstraints(pattern=r"^[A-Z0-9]{2}$")]
Cabin = Literal["economy", "premium_economy", "business", "first"]
SortBy = Literal["best", "cheapest", "fastest"]

# Ignav refuses dates outside its search range; a year ahead covers airline schedules.
MAX_DAYS_AHEAD = 360
MAX_PASSENGERS = 9


class Passengers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    adults: int = Field(default=1, ge=1, le=MAX_PASSENGERS)
    children: int = Field(default=0, ge=0, le=MAX_PASSENGERS - 1)
    infants_in_seat: int = Field(default=0, ge=0, le=MAX_PASSENGERS - 1)
    infants_on_lap: int = Field(default=0, ge=0, le=MAX_PASSENGERS - 1)

    @model_validator(mode="after")
    def check_party(self) -> Self:
        total = self.adults + self.children + self.infants_in_seat + self.infants_on_lap
        if total > MAX_PASSENGERS:
            raise ValueError(f"at most {MAX_PASSENGERS} passengers in one search")
        if self.infants_on_lap > self.adults:
            raise ValueError("each infant on a lap needs an adult")
        return self

    def key(self) -> str:
        return f"{self.adults}-{self.children}-{self.infants_in_seat}-{self.infants_on_lap}"


def _upper(value: object) -> object:
    return value.strip().upper() if isinstance(value, str) else value


class FareQuery(BaseModel):
    """One origin-destination search, as sent to a provider."""

    model_config = ConfigDict(frozen=True)

    origin: Iata
    destination: Iata
    departure_date: date
    return_date: date | None = None
    passengers: Passengers = Passengers()
    cabin: Cabin = "economy"


class FareSearchRequest(BaseModel):
    """What the website (or any client) asks for. Filters and sorting apply after the search,
    so changing them never costs another upstream request."""

    model_config = ConfigDict(extra="forbid")

    origin: Iata
    destination: Iata
    departure_date: date
    return_date: date | None = Field(default=None, description="Set for a round trip")
    passengers: Passengers = Passengers()
    cabin: Cabin = "economy"
    nearby_airports: bool = Field(
        default=False,
        description="Also search the city's other airports (for example GOX with GOI). "
        "Each extra airport pair is one more upstream request.",
    )
    # Filters and sort: applied to the results, never sent upstream.
    max_stops: int | None = Field(default=None, ge=0, le=3)
    airlines: list[AirlineCode] = Field(default_factory=list, max_length=10)
    depart_after_hour: int | None = Field(default=None, ge=0, le=23)
    depart_before_hour: int | None = Field(default=None, ge=1, le=24)
    max_price: int | None = Field(default=None, ge=1, le=10_000_000)
    sort: SortBy = "best"

    _upper_codes = field_validator("origin", "destination", mode="before")(_upper)

    @field_validator("airlines", mode="before")
    @classmethod
    def upper_airlines(cls, value: object) -> object:
        if isinstance(value, list):
            return [_upper(v) for v in value]
        return value

    @model_validator(mode="after")
    def check_trip(self) -> Self:
        if self.origin == self.destination:
            raise ValueError("origin and destination must differ")
        today = today_ist()
        if self.departure_date < today:
            raise ValueError("departure_date is in the past")
        if self.departure_date > today + timedelta(days=MAX_DAYS_AHEAD):
            raise ValueError(f"departure_date is more than {MAX_DAYS_AHEAD} days ahead")
        if self.return_date is not None and self.return_date < self.departure_date:
            raise ValueError("return_date is before departure_date")
        if self.return_date is not None and self.return_date > today + timedelta(
            days=MAX_DAYS_AHEAD
        ):
            raise ValueError(f"return_date is more than {MAX_DAYS_AHEAD} days ahead")
        if (
            self.depart_after_hour is not None
            and self.depart_before_hour is not None
            and self.depart_after_hour >= self.depart_before_hour
        ):
            raise ValueError("depart_after_hour must be before depart_before_hour")
        return self


class Segment(BaseModel):
    carrier_code: str | None
    carrier_name: str | None
    flight_number: str | None = Field(description="Carrier code and number, for example 6E2345")
    origin: str
    destination: str
    departure_local: str = Field(description="Local wall-clock time, ISO 8601 without offset")
    departure_timezone: str | None
    departure_utc: datetime | None
    arrival_local: str
    arrival_timezone: str | None
    arrival_utc: datetime | None
    duration_minutes: int
    aircraft: str | None


class Leg(BaseModel):
    origin: str
    destination: str
    departure_local: str
    departure_timezone: str | None
    arrival_local: str
    arrival_timezone: str | None
    duration_minutes: int
    stops: int
    carriers: list[str] = Field(description="Marketing carrier codes, in flight order")
    carrier_names: list[str]
    flight_numbers: list[str]
    segments: list[Segment]


class BookingRef(BaseModel):
    provider: str
    reference: str = Field(description="Pass to /fares/booking-links to get booking links")


class Offer(BaseModel):
    id: str = Field(description="Stable for the same flights from the same provider")
    provider: str
    is_demo: bool = Field(description="Generated by the demo provider: not a real fare")
    price: float = Field(description="Total for all passengers")
    currency: str
    price_verified: bool
    cabin: str | None
    outbound: Leg
    inbound: Leg | None
    total_duration_minutes: int
    stops: int = Field(description="Most stops in either direction")
    mixed_carriers: bool
    fetched_at: datetime
    booking: BookingRef


class ProviderOutcome(BaseModel):
    provider: str
    status: Literal["ok", "error", "timeout", "budget", "unavailable"]
    offers: int
    message: str | None = None


class BudgetStatus(BaseModel):
    """Upstream request allowance (ADR-0015)."""

    provider: str
    used: int
    cap: int
    today: int
    daily_cap: int | None
    near_limit: bool
    message: str | None


class AirlineOption(BaseModel):
    code: str
    name: str
    offers: int


class FareSearchResponse(BaseModel):
    origin: str
    destination: str
    departure_date: date
    return_date: date | None
    passengers: Passengers
    cabin: Cabin
    routes: list[str] = Field(description="Airport pairs searched, for example DEL-GOI")
    sort: SortBy
    offers: list[Offer]
    total_offers: int = Field(description="Before filters")
    excluded_abroad: int = Field(
        description="Itineraries left out because they connect outside India"
    )
    airlines: list[AirlineOption] = Field(description="Airlines in the results, for filters")
    fetched_at: datetime | None = Field(description="When the results were fetched upstream")
    cached: bool
    is_demo: bool
    providers: list[ProviderOutcome]
    budget: BudgetStatus | None
    notice: str = Field(description="Shown with the results")


class BookingLinksRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{1,30}$")]
    reference: Annotated[str, StringConstraints(min_length=1, max_length=2048)]

    @field_validator("reference")
    @classmethod
    def printable(cls, value: str) -> str:
        if not value.isprintable() or any(c.isspace() for c in value):
            raise ValueError("reference must be a single printable token")
        return value


class BookingLink(BaseModel):
    seller: str
    seller_type: str | None
    fare_name: str | None
    price: float | None
    currency: str | None
    url: str


class BookingLinksResponse(BaseModel):
    provider: str
    reference: str
    links: list[BookingLink]
    budget: BudgetStatus | None
