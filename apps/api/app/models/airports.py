"""Airports, terminals and airlines (docs/database/schema.md)."""

import uuid
from datetime import date

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.india import IST_TIMEZONE
from app.database.base import Base
from app.models.enums import (
    AirlineOperation,
    TerminalRole,
    airline_operation_enum,
    terminal_role_enum,
)
from app.models.mixins import Provenance, Timestamps, UuidPk, provenance_check

REGIONS_SQL = "'North','Central','East','West','South','North-East'"


class Airport(UuidPk, Timestamps, Provenance, Base):
    __tablename__ = "airports"
    __table_args__ = (
        CheckConstraint("iata ~ '^[A-Z]{3}$'", name="iata_format"),
        CheckConstraint("icao ~ '^[A-Z]{4}$'", name="icao_format"),
        CheckConstraint(f"region IN ({REGIONS_SQL})", name="region_known"),
        CheckConstraint("size IN ('large','medium','small')", name="size_known"),
        provenance_check(),
        Index("ix_airports_location", "location", postgresql_using="gist"),
        Index(
            "ix_airports_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index(
            "ix_airports_city_trgm",
            "city",
            postgresql_using="gin",
            postgresql_ops={"city": "gin_trgm_ops"},
        ),
    )

    iata: Mapped[str] = mapped_column(String(3), unique=True)
    icao: Mapped[str | None] = mapped_column(String(4), unique=True)
    name: Mapped[str] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str] = mapped_column(Text)
    location: Mapped[WKBElement] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False)
    )
    elevation_ft: Mapped[int | None] = mapped_column(Integer)
    timezone: Mapped[str] = mapped_column(Text, server_default=IST_TIMEZONE)
    # OurAirports size class, used to order the directory (large first).
    size: Mapped[str] = mapped_column(Text)
    # True when a curated guide file exists (data/airport_guides/{IATA}.yaml).
    has_guide: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    official_source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sources.id", ondelete="RESTRICT")
    )


class Terminal(UuidPk, Timestamps, Provenance, Base):
    __tablename__ = "terminals"
    __table_args__ = (UniqueConstraint("airport_id", "code"), provenance_check())

    airport_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("airports.id", ondelete="CASCADE")
    )
    code: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    role: Mapped[TerminalRole] = mapped_column(terminal_role_enum)


class Airline(UuidPk, Timestamps, Base):
    __tablename__ = "airlines"
    __table_args__ = (
        CheckConstraint("icao ~ '^[A-Z]{3}$'", name="icao_format"),
        CheckConstraint("iata IS NULL OR iata ~ '^[A-Z0-9]{2}$'", name="iata_format"),
        # IATA codes are reused over time, so they're indexed but not unique.
        Index("ix_airlines_iata", "iata"),
    )

    icao: Mapped[str] = mapped_column(String(3), unique=True)
    iata: Mapped[str | None] = mapped_column(String(2))
    name: Mapped[str] = mapped_column(Text)
    callsign: Mapped[str | None] = mapped_column(Text)
    country_iso: Mapped[str | None] = mapped_column(String(2))


class TerminalAirline(UuidPk, Timestamps, Provenance, Base):
    """An airline uses a terminal for some operation over a validity window."""

    __tablename__ = "terminal_airlines"
    __table_args__ = (
        UniqueConstraint("terminal_id", "airline_id", "operation", "valid_from"),
        CheckConstraint("valid_to IS NULL OR valid_to > valid_from", name="valid_range"),
        provenance_check(),
    )

    terminal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("terminals.id", ondelete="CASCADE")
    )
    airline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("airlines.id", ondelete="RESTRICT")
    )
    operation: Mapped[AirlineOperation] = mapped_column(airline_operation_enum)
    # Copied from the source wording, never inferred (docs/database/data-dictionary.md).
    scope_note: Mapped[str | None] = mapped_column(Text)
    valid_from: Mapped[date] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
