"""Columns shared by many tables: timestamps and content provenance (ADR-0006)."""

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.models.enums import VerificationStatus, verification_status_enum


class UuidPk:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Provenance:
    """Who checked a fact, against which source, and when. `outdated` is computed, not stored."""

    verification_status: Mapped[VerificationStatus] = mapped_column(
        verification_status_enum, server_default=VerificationStatus.UNVERIFIED.value
    )
    verified_at: Mapped[date | None] = mapped_column(Date)
    verified_by: Mapped[str | None] = mapped_column(Text)
    reverify_after_days: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    @declared_attr
    def primary_source_id(cls) -> Mapped[uuid.UUID | None]:  # noqa: N805 - SQLAlchemy declared_attr
        return mapped_column(UUID(as_uuid=True), ForeignKey("sources.id", ondelete="RESTRICT"))


def provenance_check() -> CheckConstraint:
    """A verified record must say when, by whom and against which source it was checked."""
    return CheckConstraint(
        "verification_status <> 'verified' OR (verified_at IS NOT NULL "
        "AND verified_by IS NOT NULL AND primary_source_id IS NOT NULL)",
        name="verified_has_evidence",
    )
