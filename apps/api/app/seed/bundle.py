"""Reads every seed file and checks the rules that span files. No database needed."""

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from itertools import pairwise
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ValidationError

from app.core.india import STATES
from app.eligibility.rules import ProgramEntitlement
from app.models.enums import PRIMARY_SOURCE_TYPES, VerificationStatus
from app.seed.schemas import (
    AccessProgramsFile,
    AirlinesFile,
    AirportsFile,
    AmenitiesFile,
    BanksFile,
    CardFile,
    CardNetworksFile,
    GuideFile,
    LoungesFile,
    OsmTerminalsFile,
    ProvenanceIn,
    SourceIn,
    SourcesFile,
)

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

# Default re-verification windows in days (docs/database/schema.md).
REVERIFY_DAYS = {
    "airports": 365,
    "terminals": 180,
    "terminal_airlines": 90,
    "osm_terminals": 90,
    "lounges": 60,
    "lounge_access_methods": 60,
    "credit_cards": 60,
    "lounge_policies": 60,
}


class SeedError(Exception):
    def __init__(self, errors: list[str]) -> None:
        super().__init__(f"{len(errors)} seed error(s)")
        self.errors = errors


@dataclass(frozen=True)
class Bundle:
    sources: list[SourceIn]
    airports: AirportsFile
    airlines: AirlinesFile
    osm_terminals: OsmTerminalsFile
    guides: list[GuideFile] = field(default_factory=list)
    amenities: AmenitiesFile = field(default_factory=lambda: AmenitiesFile(amenities=[]))
    networks: CardNetworksFile = field(default_factory=lambda: CardNetworksFile(card_networks=[]))
    banks: BanksFile = field(default_factory=lambda: BanksFile(banks=[]))
    programs: AccessProgramsFile = field(default_factory=lambda: AccessProgramsFile(programs=[]))
    lounges: list[LoungesFile] = field(default_factory=list)
    cards: list[CardFile] = field(default_factory=list)

    @property
    def sources_by_key(self) -> dict[str, SourceIn]:
        return {s.key: s for s in self.sources}


def _read[M: BaseModel](path: Path, model: type[M], errors: list[str]) -> M | None:
    try:
        raw: Any = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        errors.append(f"{path.name}: cannot read: {exc}")
        return None
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"])
            errors.append(f"{path.name}: {loc}: {err['msg']}")
        return None


def read_bundle(data_dir: Path = DATA_DIR) -> Bundle:
    """Parse and validate all seed files. Raises SeedError listing every problem found."""
    errors: list[str] = []
    sources = _read(data_dir / "sources.yaml", SourcesFile, errors)
    airports = _read(data_dir / "airports.yaml", AirportsFile, errors)
    airlines = _read(data_dir / "airlines.yaml", AirlinesFile, errors)
    osm = _read(data_dir / "osm_terminals.yaml", OsmTerminalsFile, errors)
    guides = [
        g
        for path in sorted((data_dir / "airport_guides").glob("*.yaml"))
        if (g := _read(path, GuideFile, errors)) is not None
    ]
    amenities = _read(data_dir / "amenities.yaml", AmenitiesFile, errors)
    networks = _read(data_dir / "card_networks.yaml", CardNetworksFile, errors)
    banks = _read(data_dir / "banks.yaml", BanksFile, errors)
    programs = _read(data_dir / "access_programs.yaml", AccessProgramsFile, errors)
    lounges = [
        f
        for path in sorted((data_dir / "lounges").glob("*.yaml"))
        if (f := _read(path, LoungesFile, errors)) is not None
    ]
    cards = [
        c
        for path in sorted((data_dir / "cards").glob("*.yaml"))
        if (c := _read(path, CardFile, errors)) is not None
    ]
    if (
        errors
        or sources is None
        or airports is None
        or airlines is None
        or osm is None
        or amenities is None
        or networks is None
        or banks is None
        or programs is None
    ):
        raise SeedError(errors)
    bundle = Bundle(
        sources.sources,
        airports,
        airlines,
        osm,
        guides,
        amenities,
        networks,
        banks,
        programs,
        lounges,
        cards,
    )
    errors.extend(validate_bundle(bundle))
    if errors:
        raise SeedError(errors)
    return bundle


def _dupes(values: list[str | None]) -> list[str]:
    return sorted(v for v, n in Counter(v for v in values if v).items() if n > 1)


def validate_bundle(bundle: Bundle) -> list[str]:
    errors: list[str] = []
    sources = bundle.sources_by_key

    for key in _dupes([s.key for s in bundle.sources]):
        errors.append(f"sources.yaml: duplicate key {key}")

    def check_provenance(where: str, p: ProvenanceIn) -> None:
        if p.source is not None and p.source not in sources:
            errors.append(f"{where}: unknown source {p.source!r}")
        elif (
            p.status is VerificationStatus.VERIFIED
            and p.source is not None
            and sources[p.source].source_type not in PRIMARY_SOURCE_TYPES
        ):
            errors.append(
                f"{where}: a verified record must cite a primary source, "
                f"{p.source!r} is {sources[p.source].source_type.value}"
            )

    if bundle.airports.source not in sources:
        errors.append(f"airports.yaml: unknown source {bundle.airports.source!r}")
    rows = bundle.airports.airports
    for code in _dupes([a.iata for a in rows]):
        errors.append(f"airports.yaml: duplicate IATA {code}")
    for code in _dupes([a.icao for a in rows]):
        errors.append(f"airports.yaml: duplicate ICAO {code}")
    for a in rows:
        if a.state_code not in STATES:
            errors.append(f"airports.yaml: {a.iata}: unknown state code {a.state_code}")

    osm = bundle.osm_terminals
    if osm.source not in sources:
        errors.append(f"osm_terminals.yaml: unknown source {osm.source!r}")
    for ref in _dupes([t.osm for t in osm.terminals]):
        errors.append(f"osm_terminals.yaml: duplicate element {ref}")
    known = {a.iata for a in rows}
    for mapped in osm.terminals:
        if mapped.iata not in known:
            errors.append(
                f"osm_terminals.yaml: {mapped.osm}: {mapped.iata} is not in airports.yaml"
            )

    airline_codes = {a.icao for a in bundle.airlines.airlines}
    for code in _dupes([a.icao for a in bundle.airlines.airlines]):
        errors.append(f"airlines.yaml: duplicate ICAO {code}")

    iatas = {a.iata for a in rows}
    for code in _dupes([g.iata for g in bundle.guides]):
        errors.append(f"airport_guides: more than one guide for {code}")
    for g in bundle.guides:
        where = f"airport_guides/{g.iata}.yaml"
        if g.iata not in iatas:
            errors.append(f"{where}: {g.iata} is not in airports.yaml")
        if g.official_source is not None:
            src = sources.get(g.official_source)
            if src is None:
                errors.append(f"{where}: unknown source {g.official_source!r}")
            elif src.source_type not in PRIMARY_SOURCE_TYPES:
                errors.append(f"{where}: official_source must be a primary source")
        for code in _dupes([t.code for t in g.terminals]):
            errors.append(f"{where}: duplicate terminal {code}")
        for t in g.terminals:
            check_provenance(f"{where}: terminal {t.code}", t.provenance)
            keys = [
                (ta.airline, ta.operation.value, ta.valid_from.isoformat()) for ta in t.airlines
            ]
            for dup in _dupes(["/".join(k) for k in keys]):
                errors.append(f"{where}: terminal {t.code}: duplicate airline entry {dup}")
            for ta in t.airlines:
                at = f"{where}: terminal {t.code}: airline {ta.airline}"
                if ta.airline not in airline_codes:
                    errors.append(f"{at}: not in airlines.yaml")
                check_provenance(at, ta.provenance)
    errors.extend(_validate_lounges_and_cards(bundle, iatas, check_provenance))
    return errors


def _overlaps(windows: list[tuple[date, date | None]]) -> bool:
    """True if any two [from, to) windows overlap (to=None means open-ended)."""
    ordered = sorted(windows, key=lambda w: w[0])
    return any(end is None or start < end for (_, end), (start, _) in pairwise(ordered))


def _validate_lounges_and_cards(
    bundle: Bundle, iatas: set[str], check_provenance: Callable[[str, ProvenanceIn], None]
) -> list[str]:
    errors: list[str] = []
    amenity_codes = {a.code for a in bundle.amenities.amenities}
    program_keys = {p.key for p in bundle.programs.programs}
    bank_slugs = {b.slug for b in bundle.banks.banks}
    network_codes = {n.code for n in bundle.networks.card_networks}
    for code in _dupes([a.code for a in bundle.amenities.amenities]):
        errors.append(f"amenities.yaml: duplicate code {code}")
    for key in _dupes([p.key for p in bundle.programs.programs]):
        errors.append(f"access_programs.yaml: duplicate key {key}")
    for slug in _dupes([b.slug for b in bundle.banks.banks]):
        errors.append(f"banks.yaml: duplicate slug {slug}")

    for slug in _dupes([lg.slug for f in bundle.lounges for lg in f.lounges]):
        errors.append(f"lounges: slug {slug} is used more than once")
    for code in _dupes([f.iata for f in bundle.lounges]):
        errors.append(f"lounges: more than one file for {code}")
    for f in bundle.lounges:
        where = f"lounges/{f.iata}.yaml"
        if f.iata not in iatas:
            errors.append(f"{where}: {f.iata} is not in airports.yaml")
        for lg in f.lounges:
            at = f"{where}: {lg.slug}"
            check_provenance(at, lg.provenance)
            for code in lg.amenities:
                if code not in amenity_codes:
                    errors.append(f"{at}: unknown amenity {code!r}")
            by_program: dict[str, list[tuple[date, date | None]]] = {}
            for acc in lg.accepts:
                if acc.program not in program_keys:
                    errors.append(f"{at}: unknown programme {acc.program!r}")
                check_provenance(f"{at}: accepts {acc.program}", acc.provenance)
                by_program.setdefault(acc.program, []).append((acc.valid_from, acc.valid_to))
            for program, windows in by_program.items():
                if _overlaps(windows):
                    errors.append(f"{at}: overlapping acceptance windows for {program}")

    for slug in _dupes([c.slug for c in bundle.cards]):
        errors.append(f"cards: slug {slug} is used more than once")
    for c in bundle.cards:
        at = f"cards: {c.slug}"
        if c.bank not in bank_slugs:
            errors.append(f"{at}: unknown bank {c.bank!r}")
        if c.network is not None and c.network not in network_codes:
            errors.append(f"{at}: unknown network {c.network!r}")
        check_provenance(at, c.provenance)
        by_scope: dict[str, list[tuple[date, date | None]]] = {}
        for pol in c.policies:
            pat = f"{at}: {pol.scope} policy from {pol.valid_from.isoformat()}"
            check_provenance(pat, pol.provenance)
            by_scope.setdefault(pol.scope, []).append((pol.valid_from, pol.valid_to))
            for rule in pol.rules:
                if isinstance(rule, ProgramEntitlement) and rule.program not in program_keys:
                    errors.append(f"{pat}: unknown programme {rule.program!r}")
        for scope, windows in by_scope.items():
            if _overlaps(windows):
                errors.append(f"{at}: overlapping {scope} policy versions")
    return errors


@dataclass(frozen=True)
class DueItem:
    """A record that needs a person to check its source again."""

    where: str
    status: str  # outdated | unverified | unavailable
    due: date | None = None


def is_outdated(verified_at: date | None, reverify_after_days: int, today: date) -> bool:
    return verified_at is not None and (today - verified_at).days > reverify_after_days


def due_for_review(bundle: Bundle, today: date) -> list[DueItem]:
    """Curated records that are outdated, unverified or unavailable (for the weekly check)."""
    items: list[DueItem] = []

    def visit(where: str, p: ProvenanceIn, table: str) -> None:
        days = p.reverify_after_days or REVERIFY_DAYS[table]
        if p.status is VerificationStatus.VERIFIED:
            if p.verified_at is not None and is_outdated(p.verified_at, days, today):
                items.append(DueItem(where, "outdated", p.verified_at + timedelta(days=days)))
        else:
            items.append(DueItem(where, p.status.value))

    for lf in bundle.lounges:
        for lg in lf.lounges:
            visit(f"{lf.iata} lounge {lg.slug}", lg.provenance, "lounges")
            for acc in lg.accepts:
                visit(
                    f"{lf.iata} lounge {lg.slug}, accepts {acc.program}",
                    acc.provenance,
                    "lounge_access_methods",
                )
    for c in bundle.cards:
        visit(f"card {c.slug}", c.provenance, "credit_cards")
        for pol in c.policies:
            if pol.valid_to is None:  # past versions don't need re-checking
                visit(f"card {c.slug}, {pol.scope} policy", pol.provenance, "lounge_policies")
    for g in bundle.guides:
        for t in g.terminals:
            visit(f"{g.iata} terminal {t.code}", t.provenance, "terminals")
            for ta in t.airlines:
                visit(
                    f"{g.iata} terminal {t.code}, airline {ta.airline}",
                    ta.provenance,
                    "terminal_airlines",
                )
    return items
