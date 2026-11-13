"""Open data about airports that isn't curated: OpenStreetMap terminals and ADS-B sightings.

Both are kept apart from the curated `terminals` and `terminal_airlines` tables, so mapped or
observed data can never be mistaken for a verified terminal assignment.
"""

import uuid
from datetime import date, datetime

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.mixins import Provenance, Timestamps, UuidPk, provenance_check


class OsmTerminal(UuidPk, Timestamps, Provenance, Base):
    """A terminal building mapped in OpenStreetMap (aeroway=terminal). ODbL, credited in the UI."""

    __tablename__ = "osm_terminals"
    __table_args__ = (
        CheckConstraint("osm_ref ~ '^(node|way|relation)/[0-9]+$'", name="osm_ref_format"),
        provenance_check(),
    )

    airport_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("airports.id", ondelete="CASCADE"), index=True
    )
    # "way/123456": the OSM element, linkable as https://www.openstreetmap.org/way/123456
    osm_ref: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str | None] = mapped_column(Text)
    ref: Mapped[str | None] = mapped_column(Text)
    location: Mapped[WKBElement] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False)
    )


class AirportSighting(Base):
    """An airline's aircraft seen on the ground or low near an airport on one day (IST).

    Written by the live service from community ADS-B data. An observation, not a schedule and
    not a terminal assignment.
    """

    __tablename__ = "airport_sightings"
    __table_args__ = (
        UniqueConstraint("airport_id", "airline_icao", "icao24", "service_date"),
        CheckConstraint("airline_icao ~ '^[A-Z]{3}$'", name="airline_icao_format"),
        CheckConstraint("icao24 ~ '^[0-9a-f]{6}$'", name="icao24_format"),
        Index("ix_airport_sightings_airport_id_service_date", "airport_id", "service_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    airport_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("airports.id", ondelete="CASCADE")
    )
    airline_icao: Mapped[str] = mapped_column(String(3))
    # The airline's name as reported by the route lookup, when one was made. Often null.
    airline_name: Mapped[str | None] = mapped_column(Text)
    icao24: Mapped[str] = mapped_column(String(6))
    callsign: Mapped[str] = mapped_column(Text)
    service_date: Mapped[date] = mapped_column(Date)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(Text)
