"""Lounges, access programmes, banks, cards and versioned lounge policies.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-14

Lounge acceptance (lounge_access_methods) and card benefits (lounge_policies, policy_rules)
are separate facts with separate sources. Policy versions and acceptance windows can't
overlap (exclusion constraints, btree_gist).
"""

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


VERIFIED_CHECK = (
    "verification_status <> 'verified' OR (verified_at IS NOT NULL "
    "AND verified_by IS NOT NULL AND primary_source_id IS NOT NULL)"
)
RULE_TYPES = ",".join(
    f"'{t}'"
    for t in (
        "program_entitlement",
        "visit_quota",
        "spend_gate",
        "guest_allowance",
        "airport_restriction",
        "entry_method",
    )
)
NEW_ENUMS = {
    "program_kind": ("membership", "network", "bank", "airline", "paid"),
    "policy_scope": ("domestic", "international"),
    "lounge_scope": ("domestic", "international", "both"),
    "lounge_side": ("airside", "landside"),
}


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in NEW_ENUMS.items():
        postgresql.ENUM(*values, name=name).create(bind, checkfirst=False)
    op.create_table(
        "access_programs",
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "kind",
            postgresql.ENUM(
                "membership",
                "network",
                "bank",
                "airline",
                "paid",
                name="program_kind",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("url", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_access_programs")),
        sa.UniqueConstraint("key", name=op.f("uq_access_programs_key")),
    )
    op.create_table(
        "amenities",
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_amenities")),
    )
    op.create_table(
        "banks",
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_banks")),
        sa.UniqueConstraint("slug", name=op.f("uq_banks_slug")),
    )
    op.create_table(
        "card_networks",
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_card_networks")),
    )
    op.create_table(
        "credit_cards",
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("bank_id", sa.UUID(), nullable=False),
        sa.Column("network_code", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("product_url", sa.Text(), nullable=False),
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
            VERIFIED_CHECK,
            name=op.f("ck_credit_cards_verified_has_evidence"),
        ),
        sa.ForeignKeyConstraint(
            ["bank_id"],
            ["banks.id"],
            name=op.f("fk_credit_cards_bank_id_banks"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["network_code"],
            ["card_networks.code"],
            name=op.f("fk_credit_cards_network_code_card_networks"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["primary_source_id"],
            ["sources.id"],
            name=op.f("fk_credit_cards_primary_source_id_sources"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_credit_cards")),
        sa.UniqueConstraint("slug", name=op.f("uq_credit_cards_slug")),
    )
    op.create_index(op.f("ix_credit_cards_bank_id"), "credit_cards", ["bank_id"], unique=False)
    op.create_index(
        op.f("ix_credit_cards_network_code"), "credit_cards", ["network_code"], unique=False
    )
    op.create_table(
        "lounge_policies",
        sa.Column("card_id", sa.UUID(), nullable=False),
        sa.Column(
            "scope",
            postgresql.ENUM("domestic", "international", name="policy_scope", create_type=False),
            nullable=False,
        ),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("unmodelled_terms", sa.Text(), nullable=True),
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
        postgresql.ExcludeConstraint(
            (sa.column("card_id"), "="),
            (sa.column("scope"), "="),
            (sa.text("daterange(valid_from, valid_to)"), "&&"),
            using="gist",
            name="ex_lounge_policies_no_overlap",
        ),
        sa.CheckConstraint(
            VERIFIED_CHECK,
            name=op.f("ck_lounge_policies_verified_has_evidence"),
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from", name=op.f("ck_lounge_policies_valid_range")
        ),
        sa.ForeignKeyConstraint(
            ["card_id"],
            ["credit_cards.id"],
            name=op.f("fk_lounge_policies_card_id_credit_cards"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["primary_source_id"],
            ["sources.id"],
            name=op.f("fk_lounge_policies_primary_source_id_sources"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lounge_policies")),
        sa.UniqueConstraint(
            "card_id", "scope", "valid_from", name=op.f("uq_lounge_policies_card_id")
        ),
    )
    op.create_table(
        "lounges",
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("airport_id", sa.UUID(), nullable=False),
        sa.Column("terminal", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("operator", sa.Text(), nullable=True),
        sa.Column(
            "scope",
            postgresql.ENUM(
                "domestic", "international", "both", name="lounge_scope", create_type=False
            ),
            nullable=False,
        ),
        sa.Column(
            "side",
            postgresql.ENUM("airside", "landside", name="lounge_side", create_type=False),
            nullable=False,
        ),
        sa.Column("location_text", sa.Text(), nullable=True),
        sa.Column("nearest_gate", sa.Text(), nullable=True),
        sa.Column("opening_hours", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "location",
            geoalchemy2.types.Geography(
                geometry_type="POINT",
                srid=4326,
                dimension=2,
                spatial_index=False,
                from_text="ST_GeogFromText",
                name="geography",
            ),
            nullable=True,
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
            VERIFIED_CHECK,
            name=op.f("ck_lounges_verified_has_evidence"),
        ),
        sa.ForeignKeyConstraint(
            ["airport_id"],
            ["airports.id"],
            name=op.f("fk_lounges_airport_id_airports"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["primary_source_id"],
            ["sources.id"],
            name=op.f("fk_lounges_primary_source_id_sources"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lounges")),
        sa.UniqueConstraint("slug", name=op.f("uq_lounges_slug")),
    )
    op.create_index(op.f("ix_lounges_airport_id"), "lounges", ["airport_id"], unique=False)
    op.create_table(
        "lounge_access_methods",
        sa.Column("lounge_id", sa.UUID(), nullable=False),
        sa.Column("access_program_id", sa.UUID(), nullable=False),
        sa.Column("paid_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("paid_duration_min", sa.Integer(), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
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
        postgresql.ExcludeConstraint(
            (sa.column("lounge_id"), "="),
            (sa.column("access_program_id"), "="),
            (sa.text("daterange(valid_from, valid_to)"), "&&"),
            using="gist",
            name="ex_lounge_access_methods_no_overlap",
        ),
        sa.CheckConstraint(
            VERIFIED_CHECK,
            name=op.f("ck_lounge_access_methods_verified_has_evidence"),
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from",
            name=op.f("ck_lounge_access_methods_valid_range"),
        ),
        sa.ForeignKeyConstraint(
            ["access_program_id"],
            ["access_programs.id"],
            name=op.f("fk_lounge_access_methods_access_program_id_access_programs"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["lounge_id"],
            ["lounges.id"],
            name=op.f("fk_lounge_access_methods_lounge_id_lounges"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["primary_source_id"],
            ["sources.id"],
            name=op.f("fk_lounge_access_methods_primary_source_id_sources"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lounge_access_methods")),
        sa.UniqueConstraint(
            "lounge_id",
            "access_program_id",
            "valid_from",
            name=op.f("uq_lounge_access_methods_lounge_id"),
        ),
    )
    op.create_table(
        "lounge_amenities",
        sa.Column("lounge_id", sa.UUID(), nullable=False),
        sa.Column("amenity_code", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["amenity_code"],
            ["amenities.code"],
            name=op.f("fk_lounge_amenities_amenity_code_amenities"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["lounge_id"],
            ["lounges.id"],
            name=op.f("fk_lounge_amenities_lounge_id_lounges"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("lounge_id", "amenity_code", name=op.f("pk_lounge_amenities")),
    )
    op.create_table(
        "policy_rules",
        sa.Column("policy_id", sa.UUID(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("rule_type", sa.Text(), nullable=False),
        sa.Column("rule", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("access_program_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.CheckConstraint(
            f"rule_type IN ({RULE_TYPES})",
            name=op.f("ck_policy_rules_rule_type_known"),
        ),
        sa.ForeignKeyConstraint(
            ["access_program_id"],
            ["access_programs.id"],
            name=op.f("fk_policy_rules_access_program_id_access_programs"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["policy_id"],
            ["lounge_policies.id"],
            name=op.f("fk_policy_rules_policy_id_lounge_policies"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_policy_rules")),
        sa.UniqueConstraint("policy_id", "position", name=op.f("uq_policy_rules_policy_id")),
    )


def downgrade() -> None:
    op.drop_table("policy_rules")
    op.drop_table("lounge_amenities")
    op.drop_table("lounge_access_methods")
    op.drop_index(op.f("ix_lounges_airport_id"), table_name="lounges")
    op.drop_table("lounges")
    op.drop_table("lounge_policies")
    op.drop_index(op.f("ix_credit_cards_network_code"), table_name="credit_cards")
    op.drop_index(op.f("ix_credit_cards_bank_id"), table_name="credit_cards")
    op.drop_table("credit_cards")
    op.drop_table("card_networks")
    op.drop_table("banks")
    op.drop_table("amenities")
    op.drop_table("access_programs")
    bind = op.get_bind()
    for name in reversed(NEW_ENUMS):
        postgresql.ENUM(name=name).drop(bind, checkfirst=False)
