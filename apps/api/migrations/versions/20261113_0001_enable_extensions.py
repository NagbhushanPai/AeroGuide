"""Enable PostGIS, pg_trgm and btree_gist.

Revision ID: 0001
Revises:
Create Date: 2026-11-13

See docs/architecture/database-architecture.md: postgis for geography columns, pg_trgm for
name/city search, btree_gist for the no-overlap exclusion constraints on versioned policies.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EXTENSIONS = ("postgis", "pg_trgm", "btree_gist")


def upgrade() -> None:
    for ext in EXTENSIONS:
        op.execute(f'CREATE EXTENSION IF NOT EXISTS "{ext}"')


def downgrade() -> None:
    for ext in reversed(EXTENSIONS):
        op.execute(f'DROP EXTENSION IF EXISTS "{ext}"')
