"""Upstream request counts per provider per IST day (ADR-0015). The fare search budget guard
reads and increments these in one locked transaction, so the cap holds across restarts and
concurrent requests."""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Integer, PrimaryKeyConstraint, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ProviderUsage(Base):
    __tablename__ = "provider_usage"
    __table_args__ = (
        PrimaryKeyConstraint("provider", "day"),
        CheckConstraint("requests >= 0", name="requests_not_negative"),
    )

    provider: Mapped[str] = mapped_column(Text)
    day: Mapped[date] = mapped_column(Date)
    requests: Mapped[int] = mapped_column(Integer, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
