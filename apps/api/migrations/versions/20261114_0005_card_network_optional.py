"""Card network becomes optional.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-14

Some banks don't say on their own pages which network a card runs on. The site records
"not stated" rather than guessing, so the column allows NULL.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("credit_cards", "network_code", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    # A network can't be invented, so cards without one are removed (their policies cascade).
    # They come back from the YAML seed after upgrading again.
    op.execute("DELETE FROM credit_cards WHERE network_code IS NULL")
    op.alter_column("credit_cards", "network_code", existing_type=sa.Text(), nullable=False)
