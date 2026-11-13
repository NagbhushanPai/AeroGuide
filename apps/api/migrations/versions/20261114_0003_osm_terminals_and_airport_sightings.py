"""OpenStreetMap terminals and airport sightings.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-14

osm_terminals: terminal buildings mapped in OpenStreetMap (unverified, ODbL).
airport_sightings: airline aircraft seen on the ground or low near an airport, per IST day.
Both are separate from the curated terminals tables on purpose.
"""

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "airport_sightings",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("airport_id", sa.UUID(), nullable=False),
        sa.Column("airline_icao", sa.String(length=3), nullable=False),
        sa.Column("airline_name", sa.Text(), nullable=True),
        sa.Column("icao24", sa.String(length=6), nullable=False),
        sa.Column("callsign", sa.Text(), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "airline_icao ~ '^[A-Z]{3}$'", name=op.f("ck_airport_sightings_airline_icao_format")
        ),
        sa.CheckConstraint(
            "icao24 ~ '^[0-9a-f]{6}$'", name=op.f("ck_airport_sightings_icao24_format")
        ),
        sa.ForeignKeyConstraint(
            ["airport_id"],
            ["airports.id"],
            name=op.f("fk_airport_sightings_airport_id_airports"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_airport_sightings")),
        sa.UniqueConstraint(
            "airport_id",
            "airline_icao",
            "icao24",
            "service_date",
            name=op.f("uq_airport_sightings_airport_id"),
        ),
    )
    op.create_index(
        "ix_airport_sightings_airport_id_service_date",
        "airport_sightings",
        ["airport_id", "service_date"],
        unique=False,
    )
    op.create_table(
        "osm_terminals",
        sa.Column("airport_id", sa.UUID(), nullable=False),
        sa.Column("osm_ref", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("ref", sa.Text(), nullable=True),
        sa.Column(
            "location",
            geoalchemy2.types.Geography(
                geometry_type="POINT",
                srid=4326,
                dimension=2,
                spatial_index=False,
                from_text="ST_GeogFromText",
                name="geography",
                nullable=False,
            ),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "verification_status",
            postgresql.ENUM(
                "verified",
                "unverified",
                "unavailable",
                name="verification_status",
                create_type=False,
            ),
            server_default="unverified",
            nullable=False,
        ),
        sa.Column("verified_at", sa.Date(), nullable=True),
        sa.Column("verified_by", sa.Text(), nullable=True),
        sa.Column("reverify_after_days", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("primary_source_id", sa.UUID(), nullable=True),
        sa.CheckConstraint(
            "osm_ref ~ '^(node|way|relation)/[0-9]+$'", name=op.f("ck_osm_terminals_osm_ref_format")
        ),
        sa.CheckConstraint(
            "verification_status <> 'verified' OR (verified_at IS NOT NULL "
            "AND verified_by IS NOT NULL AND primary_source_id IS NOT NULL)",
            name=op.f("ck_osm_terminals_verified_has_evidence"),
        ),
        sa.ForeignKeyConstraint(
            ["airport_id"],
            ["airports.id"],
            name=op.f("fk_osm_terminals_airport_id_airports"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["primary_source_id"],
            ["sources.id"],
            name=op.f("fk_osm_terminals_primary_source_id_sources"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_osm_terminals")),
        sa.UniqueConstraint("osm_ref", name=op.f("uq_osm_terminals_osm_ref")),
    )
    op.create_index(
        op.f("ix_osm_terminals_airport_id"), "osm_terminals", ["airport_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_osm_terminals_airport_id"), table_name="osm_terminals")
    op.drop_table("osm_terminals")
    op.drop_index("ix_airport_sightings_airport_id_service_date", table_name="airport_sightings")
    op.drop_table("airport_sightings")
