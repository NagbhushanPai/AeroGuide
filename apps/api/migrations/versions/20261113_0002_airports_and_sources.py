"""Sources, source checks, airports, terminals, airlines and terminal airlines.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-13

Stage 3 (docs/database/schema.md). Every fact-bearing table carries the provenance columns
from ADR-0006, with a check that a `verified` row names its source, date and checker.
"""

from collections.abc import Sequence
from typing import Any

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENUMS = {
    "verification_status": ("verified", "unverified", "unavailable"),
    "source_type": (
        "official_airport",
        "aai",
        "airline",
        "bank",
        "lounge_operator",
        "network_program",
        "licensed_provider",
        "secondary",
    ),
    "terminal_role": ("domestic", "international", "mixed"),
    "airline_operation": ("domestic", "international", "both"),
}

VERIFIED_CHECK = (
    "verification_status <> 'verified' OR (verified_at IS NOT NULL "
    "AND verified_by IS NOT NULL AND primary_source_id IS NOT NULL)"
)


def enum(name: str) -> postgresql.ENUM:
    return postgresql.ENUM(*ENUMS[name], name=name, create_type=False)


def pk() -> sa.Column[Any]:
    return sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False)


def timestamps() -> list[sa.Column[Any]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def provenance(table: str) -> list[Any]:
    return [
        sa.Column(
            "verification_status",
            enum("verification_status"),
            server_default="unverified",
            nullable=False,
        ),
        sa.Column("verified_at", sa.Date(), nullable=True),
        sa.Column("verified_by", sa.Text(), nullable=True),
        sa.Column("reverify_after_days", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("primary_source_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(
            ["primary_source_id"],
            ["sources.id"],
            name=f"fk_{table}_primary_source_id_sources",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(VERIFIED_CHECK, name=f"ck_{table}_verified_has_evidence"),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in ENUMS.items():
        postgresql.ENUM(*values, name=name).create(bind, checkfirst=False)

    op.create_table(
        "sources",
        pk(),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("publisher", sa.Text(), nullable=True),
        sa.Column("source_type", enum("source_type"), nullable=False),
        sa.Column("retrieved_at", sa.Date(), nullable=False),
        sa.Column("archived_url", sa.Text(), nullable=True),
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_sources"),
        sa.UniqueConstraint("key", name="uq_sources_key"),
    )

    op.create_table(
        "record_sources",
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("record_table", sa.Text(), nullable=False),
        sa.Column("record_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["sources.id"],
            name="fk_record_sources_source_id_sources",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("source_id", "record_table", "record_id", name="pk_record_sources"),
    )

    op.create_table(
        "source_checks",
        pk(),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column(
            "checked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("final_url", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.Text(), nullable=True),
        sa.Column("changed", sa.Boolean(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["sources.id"],
            name="fk_source_checks_source_id_sources",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_source_checks"),
    )
    op.create_index(
        "ix_source_checks_source_id_checked_at", "source_checks", ["source_id", "checked_at"]
    )

    op.create_table(
        "airports",
        pk(),
        sa.Column("iata", sa.String(3), nullable=False),
        sa.Column("icao", sa.String(4), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("city", sa.Text(), nullable=True),
        sa.Column("state", sa.Text(), nullable=True),
        sa.Column("region", sa.Text(), nullable=False),
        sa.Column(
            "location",
            geoalchemy2.Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("elevation_ft", sa.Integer(), nullable=True),
        sa.Column("timezone", sa.Text(), server_default="Asia/Kolkata", nullable=False),
        sa.Column("size", sa.Text(), nullable=False),
        sa.Column("has_guide", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("official_source_id", sa.UUID(), nullable=True),
        *timestamps(),
        *provenance("airports"),
        sa.ForeignKeyConstraint(
            ["official_source_id"],
            ["sources.id"],
            name="fk_airports_official_source_id_sources",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint("iata ~ '^[A-Z]{3}$'", name="ck_airports_iata_format"),
        sa.CheckConstraint("icao ~ '^[A-Z]{4}$'", name="ck_airports_icao_format"),
        sa.CheckConstraint(
            "region IN ('North','Central','East','West','South','North-East')",
            name="ck_airports_region_known",
        ),
        sa.CheckConstraint("size IN ('large','medium','small')", name="ck_airports_size_known"),
        sa.PrimaryKeyConstraint("id", name="pk_airports"),
        sa.UniqueConstraint("iata", name="uq_airports_iata"),
        sa.UniqueConstraint("icao", name="uq_airports_icao"),
    )
    op.create_index("ix_airports_location", "airports", ["location"], postgresql_using="gist")
    op.create_index(
        "ix_airports_name_trgm",
        "airports",
        ["name"],
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_airports_city_trgm",
        "airports",
        ["city"],
        postgresql_using="gin",
        postgresql_ops={"city": "gin_trgm_ops"},
    )

    op.create_table(
        "terminals",
        pk(),
        sa.Column("airport_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("role", enum("terminal_role"), nullable=False),
        *timestamps(),
        *provenance("terminals"),
        sa.ForeignKeyConstraint(
            ["airport_id"],
            ["airports.id"],
            name="fk_terminals_airport_id_airports",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_terminals"),
        sa.UniqueConstraint("airport_id", "code", name="uq_terminals_airport_id"),
    )

    op.create_table(
        "airlines",
        pk(),
        sa.Column("icao", sa.String(3), nullable=False),
        sa.Column("iata", sa.String(2), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("callsign", sa.Text(), nullable=True),
        sa.Column("country_iso", sa.String(2), nullable=True),
        *timestamps(),
        sa.CheckConstraint("icao ~ '^[A-Z]{3}$'", name="ck_airlines_icao_format"),
        sa.CheckConstraint(
            "iata IS NULL OR iata ~ '^[A-Z0-9]{2}$'", name="ck_airlines_iata_format"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_airlines"),
        sa.UniqueConstraint("icao", name="uq_airlines_icao"),
    )
    op.create_index("ix_airlines_iata", "airlines", ["iata"])

    op.create_table(
        "terminal_airlines",
        pk(),
        sa.Column("terminal_id", sa.UUID(), nullable=False),
        sa.Column("airline_id", sa.UUID(), nullable=False),
        sa.Column("operation", enum("airline_operation"), nullable=False),
        sa.Column("scope_note", sa.Text(), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        *timestamps(),
        *provenance("terminal_airlines"),
        sa.ForeignKeyConstraint(
            ["terminal_id"],
            ["terminals.id"],
            name="fk_terminal_airlines_terminal_id_terminals",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["airline_id"],
            ["airlines.id"],
            name="fk_terminal_airlines_airline_id_airlines",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from", name="ck_terminal_airlines_valid_range"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_terminal_airlines"),
        sa.UniqueConstraint(
            "terminal_id",
            "airline_id",
            "operation",
            "valid_from",
            name="uq_terminal_airlines_terminal_id",
        ),
    )


def downgrade() -> None:
    for table in (
        "terminal_airlines",
        "airlines",
        "terminals",
        "airports",
        "source_checks",
        "record_sources",
        "sources",
    ):
        op.drop_table(table)
    bind = op.get_bind()
    for name in reversed(ENUMS):
        postgresql.ENUM(name=name).drop(bind, checkfirst=False)
