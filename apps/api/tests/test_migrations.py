"""Every migration must upgrade and downgrade cleanly (docs/testing/testing-strategy.md)."""

import subprocess
import sys
from pathlib import Path

import pytest

API_DIR = Path(__file__).resolve().parents[1]


def alembic(*args: str) -> None:
    subprocess.run(  # noqa: S603 - fixed arguments, no user input
        [sys.executable, "-m", "alembic", *args], cwd=API_DIR, check=True
    )


@pytest.mark.integration
def test_upgrade_downgrade_upgrade() -> None:
    alembic("upgrade", "head")
    alembic("downgrade", "base")
    alembic("upgrade", "head")
