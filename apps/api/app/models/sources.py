"""Sources cited by content records, and the weekly job's link checks (ADR-0006, ADR-0013)."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.models.enums import SourceType, source_type_enum
from app.models.mixins import Timestamps, UuidPk


class Source(UuidPk, Timestamps, Base):
    __tablename__ = "sources"

    # Stable handle used by the YAML seed files (for example "ourairports", "del-official").
    key: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    publisher: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[SourceType] = mapped_column(source_type_enum)
    retrieved_at: Mapped[date] = mapped_column(Date)
    archived_url: Mapped[str | None] = mapped_column(Text)


class RecordSource(Base):
    """Extra citations for a record, beyond its primary source."""

    __tablename__ = "record_sources"
    __table_args__ = (PrimaryKeyConstraint("source_id", "record_table", "record_id"),)

    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sources.id", ondelete="CASCADE")
    )
    record_table: Mapped[str] = mapped_column(Text)
    record_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))


class SourceCheck(UuidPk, Base):
    """One link check of a source by the weekly data-check job."""

    __tablename__ = "source_checks"
    __table_args__ = (Index("ix_source_checks_source_id_checked_at", "source_id", "checked_at"),)

    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sources.id", ondelete="CASCADE")
    )
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    http_status: Mapped[int | None] = mapped_column(Integer)
    final_url: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str | None] = mapped_column(Text)
    changed: Mapped[bool | None] = mapped_column(Boolean)
    error: Mapped[str | None] = mapped_column(Text)
