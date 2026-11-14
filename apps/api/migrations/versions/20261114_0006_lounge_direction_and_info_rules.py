"""Lounge direction, informational rule types, deferrable overlap checks.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-14

- lounges.direction: departures, arrivals or transit. Arrivals and transit lounges are not
  offered to departing passengers by the checker.
- policy_rules.rule_type also allows "fee" and "add_on_cardholders" (informational).
- The no-overlap exclusion constraints become DEFERRABLE INITIALLY DEFERRED, so the seed can
  replace a version whose valid_from changed inside one transaction.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_RULES = (
    "program_entitlement",
    "visit_quota",
    "spend_gate",
    "guest_allowance",
    "airport_restriction",
    "entry_method",
)
NEW_RULES = (*OLD_RULES, "fee", "add_on_cardholders")
EXCLUSIONS = {
    "ex_lounge_policies_no_overlap": ("lounge_policies", "card_id WITH =, scope WITH ="),
    "ex_lounge_access_methods_no_overlap": (
        "lounge_access_methods",
        "lounge_id WITH =, access_program_id WITH =",
    ),
}


def _sql_list(values: Sequence[str]) -> str:
    return ",".join(f"'{v}'" for v in values)


def _exclusions(deferrable: bool) -> None:
    suffix = " DEFERRABLE INITIALLY DEFERRED" if deferrable else ""
    for name, (table, cols) in EXCLUSIONS.items():
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT {name}")
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {name} EXCLUDE USING gist "
            f"({cols}, daterange(valid_from, valid_to) WITH &&){suffix}"
        )


def _rule_check(rules: Sequence[str]) -> None:
    op.execute("ALTER TABLE policy_rules DROP CONSTRAINT ck_policy_rules_rule_type_known")
    op.execute(
        "ALTER TABLE policy_rules ADD CONSTRAINT ck_policy_rules_rule_type_known "
        f"CHECK (rule_type IN ({_sql_list(rules)}))"
    )


def upgrade() -> None:
    op.execute("CREATE TYPE lounge_direction AS ENUM ('departures', 'arrivals', 'transit')")
    op.add_column(
        "lounges",
        sa.Column(
            "direction",
            postgresql.ENUM(
                "departures", "arrivals", "transit", name="lounge_direction", create_type=False
            ),
            nullable=False,
            server_default="departures",
        ),
    )
    _rule_check(NEW_RULES)
    _exclusions(deferrable=True)


def downgrade() -> None:
    _exclusions(deferrable=False)
    op.execute(f"DELETE FROM policy_rules WHERE rule_type NOT IN ({_sql_list(OLD_RULES)})")  # noqa: S608
    _rule_check(OLD_RULES)
    op.drop_column("lounges", "direction")
    op.execute("DROP TYPE lounge_direction")
