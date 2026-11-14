"""Writes a validated Bundle to Postgres. Idempotent: upserts by natural key in one transaction,
and removes rows that are no longer in the YAML, so the database mirrors the reviewed files."""

import uuid
from dataclasses import dataclass
from typing import Any

from geoalchemy2 import WKTElement
from sqlalchemy import delete, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.india import IST_TIMEZONE, STATES
from app.models import Airline, Airport, OsmTerminal, Source, Terminal, TerminalAirline
from app.models.enums import VerificationStatus
from app.seed.bundle import REVERIFY_DAYS, Bundle
from app.seed.loader_lounges import LoungeSummary, apply_lounges_and_cards
from app.seed.schemas import ProvenanceIn

GEODATA_NOTE = "Geodata from OurAirports. Not yet cross-checked against AIP India."
OSM_NOTE = "As mapped in OpenStreetMap. Not checked against the airport operator."


@dataclass(frozen=True)
class SeedSummary:
    sources: int
    airports: int
    guides: int
    airlines: int
    terminals: int
    terminal_airlines: int
    osm_terminals: int
    lounges: LoungeSummary


def _provenance(p: ProvenanceIn, table: str, sources: dict[str, uuid.UUID]) -> dict[str, Any]:
    return {
        "verification_status": p.status,
        "verified_at": p.verified_at,
        "verified_by": p.verified_by,
        "reverify_after_days": p.reverify_after_days or REVERIFY_DAYS[table],
        "primary_source_id": sources[p.source] if p.source else None,
        "notes": p.notes,
    }


async def _upsert(
    conn: AsyncConnection, model: Any, values: dict[str, Any], conflict: list[str]
) -> uuid.UUID:
    base = insert(model).values(**values)
    update = {k: base.excluded[k] for k in values if k not in conflict}
    stmt = base.on_conflict_do_update(
        index_elements=conflict, set_={**update, "updated_at": func.now()}
    ).returning(model.id)
    result: uuid.UUID = (await conn.execute(stmt)).scalar_one()
    return result


async def apply_bundle(conn: AsyncConnection, bundle: Bundle) -> SeedSummary:
    source_ids: dict[str, uuid.UUID] = {}
    for s in bundle.sources:
        source_ids[s.key] = await _upsert(
            conn,
            Source,
            {
                "key": s.key,
                "name": s.name,
                "url": str(s.url),
                "publisher": s.publisher,
                "source_type": s.source_type,
                "retrieved_at": s.retrieved_at,
                "archived_url": str(s.archived_url) if s.archived_url else None,
            },
            ["key"],
        )

    guides = {g.iata: g for g in bundle.guides}
    geodata_source = source_ids[bundle.airports.source]
    airport_ids: dict[str, uuid.UUID] = {}
    for a in bundle.airports.airports:
        state, region = STATES[a.state_code]
        guide = guides.get(a.iata)
        official = guide.official_source if guide else None
        airport_ids[a.iata] = await _upsert(
            conn,
            Airport,
            {
                "iata": a.iata,
                "icao": a.icao,
                "name": a.name,
                "city": a.city,
                "state": state,
                "region": region.value,
                "location": WKTElement(f"POINT({a.lon} {a.lat})", srid=4326),
                "elevation_ft": a.elevation_ft,
                "timezone": IST_TIMEZONE,
                "size": a.size,
                "has_guide": guide is not None,
                "official_source_id": source_ids[official] if official else None,
                # A secondary source can't verify a record (ADR-0006), so geodata stays unverified.
                "verification_status": VerificationStatus.UNVERIFIED,
                "verified_at": None,
                "verified_by": None,
                "reverify_after_days": REVERIFY_DAYS["airports"],
                "primary_source_id": geodata_source,
                "notes": GEODATA_NOTE,
            },
            ["iata"],
        )

    airline_ids: dict[str, uuid.UUID] = {}
    for al in bundle.airlines.airlines:
        airline_ids[al.icao] = await _upsert(
            conn,
            Airline,
            {
                "icao": al.icao,
                "iata": al.iata,
                "name": al.name,
                "callsign": al.callsign,
                "country_iso": al.country_iso,
            },
            ["icao"],
        )

    terminal_ids: list[uuid.UUID] = []
    assignment_ids: list[uuid.UUID] = []
    for g in bundle.guides:
        for t in g.terminals:
            tid = await _upsert(
                conn,
                Terminal,
                {
                    "airport_id": airport_ids[g.iata],
                    "code": t.code,
                    "name": t.name,
                    "role": t.role,
                    **_provenance(t.provenance, "terminals", source_ids),
                },
                ["airport_id", "code"],
            )
            terminal_ids.append(tid)
            for ta in t.airlines:
                assignment_ids.append(
                    await _upsert(
                        conn,
                        TerminalAirline,
                        {
                            "terminal_id": tid,
                            "airline_id": airline_ids[ta.airline],
                            "operation": ta.operation,
                            "scope_note": ta.scope_note,
                            "valid_from": ta.valid_from,
                            "valid_to": ta.valid_to,
                            **_provenance(ta.provenance, "terminal_airlines", source_ids),
                        },
                        ["terminal_id", "airline_id", "operation", "valid_from"],
                    )
                )

    osm_source = source_ids[bundle.osm_terminals.source]
    osm_ids: list[uuid.UUID] = []
    for ot in bundle.osm_terminals.terminals:
        osm_ids.append(
            await _upsert(
                conn,
                OsmTerminal,
                {
                    "airport_id": airport_ids[ot.iata],
                    "osm_ref": ot.osm,
                    "name": ot.name,
                    "ref": ot.ref,
                    "location": WKTElement(f"POINT({ot.lon} {ot.lat})", srid=4326),
                    "verification_status": VerificationStatus.UNVERIFIED,
                    "verified_at": None,
                    "verified_by": None,
                    "reverify_after_days": REVERIFY_DAYS["osm_terminals"],
                    "primary_source_id": osm_source,
                    "notes": OSM_NOTE,
                },
                ["osm_ref"],
            )
        )

    lounge_summary = await apply_lounges_and_cards(conn, bundle, source_ids, airport_ids)

    # Remove what the YAML no longer contains (children first, sources last).
    await conn.execute(delete(OsmTerminal).where(OsmTerminal.id.not_in(osm_ids)))
    await conn.execute(delete(TerminalAirline).where(TerminalAirline.id.not_in(assignment_ids)))
    await conn.execute(delete(Terminal).where(Terminal.id.not_in(terminal_ids)))
    await conn.execute(delete(Airline).where(Airline.id.not_in(list(airline_ids.values()))))
    await conn.execute(delete(Airport).where(Airport.id.not_in(list(airport_ids.values()))))
    await conn.execute(delete(Source).where(Source.id.not_in(list(source_ids.values()))))

    # The API keeps lounges and cards in memory for a few minutes; drop them so the next
    # request in this process sees what was just written.
    from app.services.lounges import clear_catalogue

    clear_catalogue()
    return SeedSummary(
        sources=len(source_ids),
        airports=len(airport_ids),
        guides=len(guides),
        airlines=len(airline_ids),
        terminals=len(terminal_ids),
        terminal_airlines=len(assignment_ids),
        osm_terminals=len(osm_ids),
        lounges=lounge_summary,
    )
