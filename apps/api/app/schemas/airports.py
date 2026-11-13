"""Airport API responses. Every fact-bearing object carries its provenance (ADR-0006)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.core.india import Region
from app.models.enums import AirlineOperation, SourceType, TerminalRole

DisplayStatus = Literal["verified", "outdated", "unverified", "unavailable"]


class SourceRef(BaseModel):
    name: str
    url: str
    publisher: str | None
    source_type: SourceType
    retrieved_at: date


class Provenance(BaseModel):
    status: DisplayStatus = Field(
        description="`outdated` is computed: verified, but the re-verification window has passed."
    )
    verified_at: date | None
    reverify_due: date | None = Field(description="When a verified record should be checked again.")
    source: SourceRef | None
    notes: str | None


class AirportSummary(BaseModel):
    iata: str
    icao: str | None
    name: str
    city: str | None
    state: str | None
    region: Region
    lat: float
    lon: float
    size: Literal["large", "medium", "small"]
    has_guide: bool = Field(description="A curated guide exists (terminals and airlines).")
    status: DisplayStatus = Field(description="Verification status of the airport's geodata.")


class AirportList(BaseModel):
    items: list[AirportSummary]
    total: int
    limit: int
    offset: int


class AirlineRef(BaseModel):
    icao: str
    iata: str | None
    name: str


class TerminalAirlineOut(BaseModel):
    airline: AirlineRef
    operation: AirlineOperation
    scope_note: str | None
    valid_from: date
    valid_to: date | None
    provenance: Provenance


class TerminalOut(BaseModel):
    code: str
    name: str
    role: TerminalRole
    provenance: Provenance
    airlines: list[TerminalAirlineOut]


class AirportDetail(AirportSummary):
    elevation_ft: int | None
    timezone: str
    official_source: SourceRef | None = Field(
        description="The operator's official website, where travellers should confirm details."
    )
    provenance: Provenance = Field(description="Provenance of the geodata (codes, coordinates).")
    terminals: list[TerminalOut]
    terminal_note: str = Field(
        description="Always shown: terminal assignments change, so travellers must confirm them."
    )
