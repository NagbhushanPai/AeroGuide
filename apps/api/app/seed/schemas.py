"""Shapes of the YAML seed files in apps/api/data (ADR-0007). Rules within one record live here;
rules across files (does a source key exist?) live in bundle.validate_bundle."""

from datetime import date
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, model_validator

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
        if self.verified_at is not None and self.verified_at > date.today():
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
