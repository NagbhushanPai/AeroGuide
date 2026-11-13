"""Lounges, access programmes, banks, cards and versioned lounge policies (Stage 5).

Two kinds of fact are kept apart on purpose:
  - what a lounge ACCEPTS (lounge_access_methods): a fact about the lounge, from the lounge
    operator or programme;
  - what a card GRANTS (lounge_policies + policy_rules): a fact about the card, from the bank.
The eligibility engine joins them. Policies are versioned and never edited in place.
"""

import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import Any

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID, ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.eligibility.rules import RULE_TYPES
from app.models.enums import pg_enum
from app.models.mixins import Provenance, Timestamps, UuidPk, provenance_check


class LoungeScope(StrEnum):
    DOMESTIC = "domestic"
    INTERNATIONAL = "international"
    BOTH = "both"


class LoungeSide(StrEnum):
    AIRSIDE = "airside"
    LANDSIDE = "landside"


class ProgramKind(StrEnum):
    MEMBERSHIP = "membership"  # for example a paid lounge membership
    NETWORK = "network"  # a card network's lounge programme
    BANK = "bank"  # a bank's own arrangement
    AIRLINE = "airline"  # class of travel or status
    PAID = "paid"  # walk-in payment


class PolicyScope(StrEnum):
    DOMESTIC = "domestic"
    INTERNATIONAL = "international"


lounge_scope_enum = pg_enum(LoungeScope, "lounge_scope")
lounge_side_enum = pg_enum(LoungeSide, "lounge_side")
program_kind_enum = pg_enum(ProgramKind, "program_kind")
policy_scope_enum = pg_enum(PolicyScope, "policy_scope")

RULE_TYPES_SQL = ",".join(f"'{t}'" for t in RULE_TYPES)


class Amenity(Base):
    __tablename__ = "amenities"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    label: Mapped[str] = mapped_column(Text)


class AccessProgram(UuidPk, Timestamps, Base):
    __tablename__ = "access_programs"

    key: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    kind: Mapped[ProgramKind] = mapped_column(program_kind_enum)
    url: Mapped[str | None] = mapped_column(Text)


class Lounge(UuidPk, Timestamps, Provenance, Base):
    __tablename__ = "lounges"
    __table_args__ = (provenance_check(),)

    slug: Mapped[str] = mapped_column(Text, unique=True)
    airport_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("airports.id", ondelete="CASCADE"), index=True
    )
    # As the source names it (for example "T3"). Curated terminals may not exist yet.
    terminal: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    operator: Mapped[str | None] = mapped_column(Text)
    scope: Mapped[LoungeScope] = mapped_column(lounge_scope_enum)
    side: Mapped[LoungeSide] = mapped_column(lounge_side_enum)
    location_text: Mapped[str | None] = mapped_column(Text)
    nearest_gate: Mapped[str | None] = mapped_column(Text)
    # {"mode": "24h"} or {"mode": "weekly", "periods": [...]}; null = not verified.
    opening_hours: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    location: Mapped[WKBElement | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False)
    )


class LoungeAmenity(Base):
    """Present only if the source states it. A missing tag means "not stated"."""

    __tablename__ = "lounge_amenities"
    __table_args__ = (PrimaryKeyConstraint("lounge_id", "amenity_code"),)

    lounge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lounges.id", ondelete="CASCADE")
    )
    amenity_code: Mapped[str] = mapped_column(
        Text, ForeignKey("amenities.code", ondelete="RESTRICT")
    )


class LoungeAccessMethod(UuidPk, Timestamps, Provenance, Base):
    """The lounge accepts this programme over the window. Says nothing about any card."""

    __tablename__ = "lounge_access_methods"
    __table_args__ = (
        UniqueConstraint("lounge_id", "access_program_id", "valid_from"),
        CheckConstraint("valid_to IS NULL OR valid_to > valid_from", name="valid_range"),
        ExcludeConstraint(
            ("lounge_id", "="),
            ("access_program_id", "="),
            (text("daterange(valid_from, valid_to)"), "&&"),
            name="ex_lounge_access_methods_no_overlap",
            using="gist",
        ),
        provenance_check(),
    )

    lounge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lounges.id", ondelete="CASCADE")
    )
    access_program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("access_programs.id", ondelete="RESTRICT")
    )
    paid_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    paid_duration_min: Mapped[int | None] = mapped_column(Integer)
    valid_from: Mapped[date] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)


class Bank(UuidPk, Timestamps, Base):
    __tablename__ = "banks"

    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)


class CardNetwork(Base):
    __tablename__ = "card_networks"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)


class CreditCard(UuidPk, Timestamps, Provenance, Base):
    """A card product. A variant with different benefits is its own card (own slug)."""

    __tablename__ = "credit_cards"
    __table_args__ = (provenance_check(),)

    slug: Mapped[str] = mapped_column(Text, unique=True)
    bank_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("banks.id", ondelete="RESTRICT"), index=True
    )
    network_code: Mapped[str] = mapped_column(
        Text, ForeignKey("card_networks.code", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    product_url: Mapped[str] = mapped_column(Text)


class LoungePolicy(UuidPk, Timestamps, Provenance, Base):
    """One version of a card's domestic or international lounge benefit. Never edited:
    a change adds a version, and versions of the same card and scope never overlap."""

    __tablename__ = "lounge_policies"
    __table_args__ = (
        UniqueConstraint("card_id", "scope", "valid_from"),
        CheckConstraint("valid_to IS NULL OR valid_to > valid_from", name="valid_range"),
        ExcludeConstraint(
            ("card_id", "="),
            ("scope", "="),
            (text("daterange(valid_from, valid_to)"), "&&"),
            name="ex_lounge_policies_no_overlap",
            using="gist",
        ),
        provenance_check(),
    )

    card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_cards.id", ondelete="CASCADE")
    )
    scope: Mapped[PolicyScope] = mapped_column(policy_scope_enum)
    valid_from: Mapped[date] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    summary: Mapped[str] = mapped_column(Text)
    # Bank wording no rule type captures, quoted. Makes every answer "depends".
    unmodelled_terms: Mapped[str | None] = mapped_column(Text)


class PolicyRule(UuidPk, Base):
    __tablename__ = "policy_rules"
    __table_args__ = (
        CheckConstraint(f"rule_type IN ({RULE_TYPES_SQL})", name="rule_type_known"),
        UniqueConstraint("policy_id", "position"),
    )

    policy_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lounge_policies.id", ondelete="CASCADE")
    )
    position: Mapped[int] = mapped_column(Integer)
    rule_type: Mapped[str] = mapped_column(Text)
    # Validated by app.eligibility.rules before insert.
    rule: Mapped[dict[str, Any]] = mapped_column(JSONB)
    access_program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("access_programs.id", ondelete="RESTRICT")
    )
