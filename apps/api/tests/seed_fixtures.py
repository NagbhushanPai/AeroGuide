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


TEST_PROGRAMME = """\
programs:
  - key: test-programme
    name: Test Lounge Programme
    kind: membership
    url: https://example.org/programme
"""

TEST_SOURCES_EXTRA = """
  - key: test-bank-page
    name: Test Bank card page
    url: https://example.org/bank
    source_type: bank
    retrieved_at: 2026-11-01
  - key: test-lounge-page
    name: Test lounge operator page
    url: https://example.org/lounge
    source_type: lounge_operator
    retrieved_at: 2026-11-01
"""

TEST_LOUNGES = """\
iata: DEL
lounges:
  - slug: test-lounge-del-t9
    name: Test Lounge
    terminal: T9
    operator: Test Operator
    scope: domestic
    side: airside
    location_text: "Near test gate 1"
    opening_hours: { mode: 24h }
    amenities: [wifi, food]
    provenance: { status: verified, source: test-lounge-page, verified_at: 2026-11-01, verified_by: test }
    accepts:
      - program: test-programme
        valid_from: 2026-01-01
        provenance: { status: verified, source: test-lounge-page, verified_at: 2026-11-01, verified_by: test }
  - slug: test-lounge-del-intl
    name: Test International Lounge
    scope: international
    side: airside
    provenance: { status: unverified, source: test-lounge-page }
"""

TEST_CARD = """\
slug: test-bank-voyager
bank: test-bank
network: visa
name: Test Voyager
product_url: https://example.org/bank/voyager
provenance: { status: verified, source: test-bank-page, verified_at: 2026-11-01, verified_by: test }
policies:
  - scope: domestic
    valid_from: 2025-01-01
    valid_to: 2026-07-01
    summary: Old version, 8 visits a year.
    rules:
      - { type: program_entitlement, program: test-programme }
      - { type: visit_quota, count: 8, period: year }
    provenance: { status: verified, source: test-bank-page, verified_at: 2026-11-01, verified_by: test }
  - scope: domestic
    valid_from: 2026-07-01
    summary: 2 visits a quarter after spending 50,000 rupees in the previous calendar quarter.
    rules:
      - { type: program_entitlement, program: test-programme }
      - { type: visit_quota, count: 2, period: quarter }
      - { type: spend_gate, amount: 50000, window: previous_calendar_quarter }
      - { type: entry_method, method: card_swipe }
    provenance: { status: verified, source: test-bank-page, verified_at: 2026-11-01, verified_by: test }
"""


def with_test_lounges(tmp_path: Path) -> Path:
    """Real reference data, but only the fictional lounges and card (no real ones)."""
    data = copy_data(tmp_path)
    for path in [*(data / "lounges").glob("*.yaml"), *(data / "cards").glob("*.yaml")]:
        path.unlink()
    sources = data / "sources.yaml"
    sources.write_text(sources.read_text(encoding="utf-8") + TEST_SOURCES_EXTRA, encoding="utf-8")
    (data / "access_programs.yaml").write_text(TEST_PROGRAMME, encoding="utf-8")
    banks = data / "banks.yaml"
    banks.write_text(
        banks.read_text(encoding="utf-8")
        + '  - { slug: test-bank, name: Test Bank, url: "https://example.org/bank" }\n',
        encoding="utf-8",
    )
    (data / "lounges" / "DEL.yaml").write_text(TEST_LOUNGES, encoding="utf-8")
    (data / "cards" / "test-bank--voyager.yaml").write_text(TEST_CARD, encoding="utf-8")
    return data
