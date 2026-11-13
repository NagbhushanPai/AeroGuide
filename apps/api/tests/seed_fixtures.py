"""Builds temporary seed directories for tests. Fixture content uses obviously fake values
(airline TST, verifier "test"), never real airport facts."""

import shutil
from pathlib import Path

from app.seed.bundle import DATA_DIR

FAKE_AIRLINE = """\
airlines:
  - icao: TST
    iata: T0
    name: Test Air
"""

DEL_GUIDE_WITH_TERMINAL = """\
iata: DEL
official_source: del-official
terminals:
  - code: T9
    name: Test Terminal 9
    role: domestic
    provenance:
      status: verified
      source: del-official
      verified_at: {verified_at}
      verified_by: test
    airlines:
      - airline: TST
        operation: domestic
        scope_note: test flights only
        valid_from: 2026-01-01
        provenance:
          status: unverified
          source: del-official
"""


def copy_data(tmp_path: Path) -> Path:
    dest = tmp_path / "data"
    shutil.copytree(DATA_DIR, dest)
    return dest


def with_test_terminal(tmp_path: Path, verified_at: str = "2026-11-01") -> Path:
    data = copy_data(tmp_path)
    (data / "airlines.yaml").write_text(FAKE_AIRLINE, encoding="utf-8")
    (data / "airport_guides" / "DEL.yaml").write_text(
        DEL_GUIDE_WITH_TERMINAL.format(verified_at=verified_at), encoding="utf-8"
    )
    return data
