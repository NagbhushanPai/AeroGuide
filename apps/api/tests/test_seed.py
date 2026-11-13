"""Seed file validation (ADR-0006, ADR-0007). No database needed."""

from datetime import date
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.india import STATES, Region
from app.seed.__main__ import main as seed_cli
from app.seed.bundle import SeedError, due_for_review, read_bundle
from app.seed.schemas import ProvenanceIn
from tests.seed_fixtures import copy_data, with_test_terminal


def test_repository_seed_files_are_valid() -> None:
    bundle = read_bundle()
    iatas = {a.iata for a in bundle.airports.airports}
    assert len(iatas) == len(bundle.airports.airports) > 100
    assert {"DEL", "BOM", "BLR", "HYD", "MAA", "COK", "JAI"} <= {g.iata for g in bundle.guides}
    assert all(a.state_code in STATES for a in bundle.airports.airports)


def test_every_state_has_a_known_region() -> None:
    assert {region for _, region in STATES.values()} == set(Region)


def test_check_cli_passes_on_repository_files(capsys: pytest.CaptureFixture[str]) -> None:
    assert seed_cli(["--check"]) == 0
    assert "seed files OK" in capsys.readouterr().out


@pytest.mark.parametrize("missing", ["source", "verified_at", "verified_by"])
def test_verified_needs_source_date_and_checker(missing: str) -> None:
    fields = {"status": "verified", "source": "x", "verified_at": "2026-01-01", "verified_by": "a"}
    del fields[missing]
    with pytest.raises(ValidationError, match=missing):
        ProvenanceIn.model_validate(fields)


def test_verified_at_cannot_be_in_the_future() -> None:
    with pytest.raises(ValidationError, match="future"):
        ProvenanceIn.model_validate(
            {"status": "verified", "source": "x", "verified_at": "2999-01-01", "verified_by": "a"}
        )


def test_unverified_needs_no_evidence() -> None:
    assert ProvenanceIn.model_validate({}).status == "unverified"


def test_verified_record_cannot_cite_a_secondary_source(tmp_path: Path) -> None:
    data = with_test_terminal(tmp_path)
    guide = data / "airport_guides" / "DEL.yaml"
    guide.write_text(
        guide.read_text(encoding="utf-8").replace(
            "      source: del-official\n      verified_at",
            "      source: ourairports\n      verified_at",
            1,
        ),
        encoding="utf-8",
    )
    with pytest.raises(SeedError) as exc:
        read_bundle(data)
    assert any("must cite a primary source" in e for e in exc.value.errors)


def test_cross_file_references_are_checked(tmp_path: Path) -> None:
    data = with_test_terminal(tmp_path)
    (data / "airlines.yaml").write_text("airlines: []\n", encoding="utf-8")
    (data / "airport_guides" / "ZZZ.yaml").write_text(
        "iata: ZZZ\nofficial_source: nope\nterminals: []\n", encoding="utf-8"
    )
    with pytest.raises(SeedError) as exc:
        read_bundle(data)
    errors = "\n".join(exc.value.errors)
    assert "airline TST: not in airlines.yaml" in errors
    assert "ZZZ is not in airports.yaml" in errors
    assert "unknown source 'nope'" in errors


def test_unknown_fields_and_bad_codes_are_rejected(tmp_path: Path) -> None:
    data = copy_data(tmp_path)
    (data / "airport_guides" / "DEL.yaml").write_text(
        "iata: del\nterminals: []\nlounges: []\n", encoding="utf-8"
    )
    with pytest.raises(SeedError) as exc:
        read_bundle(data)
    errors = "\n".join(exc.value.errors)
    assert "DEL.yaml: iata" in errors
    assert "DEL.yaml: lounges" in errors


def test_review_queue_lists_outdated_and_unverified(tmp_path: Path) -> None:
    bundle = read_bundle(with_test_terminal(tmp_path, verified_at="2026-01-01"))
    items = {d.where: d for d in due_for_review(bundle, date(2026, 11, 13))}
    terminal = items["DEL terminal T9"]
    assert terminal.status == "outdated"
    assert terminal.due == date(2026, 6, 30)  # 180 days after verification
    assert items["DEL terminal T9, airline TST"].status == "unverified"


def test_recently_verified_record_is_not_due(tmp_path: Path) -> None:
    bundle = read_bundle(with_test_terminal(tmp_path, verified_at="2026-11-01"))
    assert "DEL terminal T9" not in {d.where for d in due_for_review(bundle, date(2026, 11, 13))}


def test_osm_terminals_must_belong_to_listed_airports(tmp_path: Path) -> None:
    data = copy_data(tmp_path)
    (data / "osm_terminals.yaml").write_text(
        "source: openstreetmap\nretrieved_at: 2026-11-14\nterminals:\n"
        "  - {iata: ZZZ, osm: way/1, name: Test, lat: 1, lon: 1}\n"
        "  - {iata: DEL, osm: way/2, name: Test, lat: 1, lon: 1}\n"
        "  - {iata: DEL, osm: way/2, name: Again, lat: 1, lon: 1}\n"
        "  - {iata: DEL, osm: street/3, name: Bad, lat: 1, lon: 1}\n",
        encoding="utf-8",
    )
    with pytest.raises(SeedError) as exc:
        read_bundle(data)
    errors = "\n".join(exc.value.errors)
    assert "osm" in errors  # street/3 fails the element format
    data2 = copy_data(tmp_path / "b")
    (data2 / "osm_terminals.yaml").write_text(
        "source: openstreetmap\nretrieved_at: 2026-11-14\nterminals:\n"
        "  - {iata: ZZZ, osm: way/1, name: Test, lat: 1, lon: 1}\n"
        "  - {iata: DEL, osm: way/2, name: Test, lat: 1, lon: 1}\n"
        "  - {iata: DEL, osm: way/2, name: Again, lat: 1, lon: 1}\n",
        encoding="utf-8",
    )
    with pytest.raises(SeedError) as exc2:
        read_bundle(data2)
    errors2 = "\n".join(exc2.value.errors)
    assert "ZZZ is not in airports.yaml" in errors2
    assert "duplicate element way/2" in errors2
