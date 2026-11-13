"""Writes lounges, programmes, banks, cards and policies (Stage 5). Same rules as loader.py:
upsert by natural key, then delete whatever the YAML no longer contains."""

import uuid
from dataclasses import dataclass
from typing import Any

from geoalchemy2 import WKTElement
from sqlalchemy import delete, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.eligibility.rules import ProgramEntitlement
from app.models import (
    AccessProgram,
    Amenity,
    Bank,
    CardNetwork,
    CreditCard,
    Lounge,
    LoungeAccessMethod,
    LoungeAmenity,
    LoungePolicy,
    PolicyRule,
)
from app.seed.bundle import REVERIFY_DAYS, Bundle
from app.seed.schemas import ProvenanceIn


@dataclass(frozen=True)
class LoungeSummary:
    programs: int
    lounges: int
    banks: int
    cards: int
    policies: int


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
    conn: AsyncConnection,
    model: Any,
    values: dict[str, Any],
    conflict: list[str],
    returning: Any = None,
) -> Any:
    base = insert(model).values(**values)
    update: dict[str, Any] = {k: base.excluded[k] for k in values if k not in conflict}
    if hasattr(model, "updated_at"):
        update["updated_at"] = func.now()
    stmt = (
        base.on_conflict_do_update(index_elements=conflict, set_=update)
        if update
        else base.on_conflict_do_nothing(index_elements=conflict)
    )
    if returning is None:
        await conn.execute(stmt)
        return None
    return (await conn.execute(stmt.returning(returning))).scalar_one()


async def apply_lounges_and_cards(
    conn: AsyncConnection,
    bundle: Bundle,
    source_ids: dict[str, uuid.UUID],
    airport_ids: dict[str, uuid.UUID],
) -> LoungeSummary:
    for a in bundle.amenities.amenities:
        await _upsert(conn, Amenity, {"code": a.code, "label": a.label}, ["code"])
    for n in bundle.networks.card_networks:
        await _upsert(conn, CardNetwork, {"code": n.code, "name": n.name}, ["code"])

    program_ids: dict[str, uuid.UUID] = {}
    for prog in bundle.programs.programs:
        program_ids[prog.key] = await _upsert(
            conn,
            AccessProgram,
            {
                "key": prog.key,
                "name": prog.name,
                "kind": prog.kind,
                "url": str(prog.url) if prog.url else None,
            },
            ["key"],
            AccessProgram.id,
        )

    lounge_ids: list[uuid.UUID] = []
    acceptance_ids: list[uuid.UUID] = []
    for lf in bundle.lounges:
        for lg in lf.lounges:
            lid = await _upsert(
                conn,
                Lounge,
                {
                    "slug": lg.slug,
                    "airport_id": airport_ids[lf.iata],
                    "terminal": lg.terminal,
                    "name": lg.name,
                    "operator": lg.operator,
                    "scope": lg.scope,
                    "side": lg.side,
                    "location_text": lg.location_text,
                    "nearest_gate": lg.nearest_gate,
                    "opening_hours": lg.opening_hours.model_dump() if lg.opening_hours else None,
                    "location": WKTElement(f"POINT({lg.lon} {lg.lat})", srid=4326)
                    if lg.lat is not None
                    else None,
                    **_provenance(lg.provenance, "lounges", source_ids),
                },
                ["slug"],
                Lounge.id,
            )
            lounge_ids.append(lid)
            await conn.execute(delete(LoungeAmenity).where(LoungeAmenity.lounge_id == lid))
            for code in lg.amenities:
                await _upsert(
                    conn,
                    LoungeAmenity,
                    {"lounge_id": lid, "amenity_code": code},
                    ["lounge_id", "amenity_code"],
                )
            for acc in lg.accepts:
                acceptance_ids.append(
                    await _upsert(
                        conn,
                        LoungeAccessMethod,
                        {
                            "lounge_id": lid,
                            "access_program_id": program_ids[acc.program],
                            "paid_price": acc.paid_price,
                            "currency": acc.currency,
                            "paid_duration_min": acc.paid_duration_min,
                            "valid_from": acc.valid_from,
                            "valid_to": acc.valid_to,
                            **_provenance(acc.provenance, "lounge_access_methods", source_ids),
                        },
                        ["lounge_id", "access_program_id", "valid_from"],
                        LoungeAccessMethod.id,
                    )
                )

    bank_ids: dict[str, uuid.UUID] = {}
    for b in bundle.banks.banks:
        bank_ids[b.slug] = await _upsert(
            conn, Bank, {"slug": b.slug, "name": b.name, "url": str(b.url)}, ["slug"], Bank.id
        )

    card_ids: list[uuid.UUID] = []
    policy_ids: list[uuid.UUID] = []
    for c in bundle.cards:
        cid = await _upsert(
            conn,
            CreditCard,
            {
                "slug": c.slug,
                "bank_id": bank_ids[c.bank],
                "network_code": c.network,
                "name": c.name,
                "product_url": str(c.product_url),
                **_provenance(c.provenance, "credit_cards", source_ids),
            },
            ["slug"],
            CreditCard.id,
        )
        card_ids.append(cid)
        for pol in c.policies:
            pid = await _upsert(
                conn,
                LoungePolicy,
                {
                    "card_id": cid,
                    "scope": pol.scope,
                    "valid_from": pol.valid_from,
                    "valid_to": pol.valid_to,
                    "summary": pol.summary,
                    "unmodelled_terms": pol.unmodelled_terms,
                    **_provenance(pol.provenance, "lounge_policies", source_ids),
                },
                ["card_id", "scope", "valid_from"],
                LoungePolicy.id,
            )
            policy_ids.append(pid)
            # Rules have no natural key: replace them with the reviewed list.
            await conn.execute(delete(PolicyRule).where(PolicyRule.policy_id == pid))
            for position, rule in enumerate(pol.rules):
                await conn.execute(
                    insert(PolicyRule).values(
                        policy_id=pid,
                        position=position,
                        rule_type=rule.type,
                        rule=rule.model_dump(mode="json"),
                        access_program_id=program_ids[rule.program]
                        if isinstance(rule, ProgramEntitlement)
                        else None,
                    )
                )

    # Remove what the YAML no longer contains (children first).
    await conn.execute(delete(LoungePolicy).where(LoungePolicy.id.not_in(policy_ids)))
    await conn.execute(delete(CreditCard).where(CreditCard.id.not_in(card_ids)))
    await conn.execute(delete(Bank).where(Bank.id.not_in(list(bank_ids.values()))))
    await conn.execute(
        delete(LoungeAccessMethod).where(LoungeAccessMethod.id.not_in(acceptance_ids))
    )
    await conn.execute(delete(Lounge).where(Lounge.id.not_in(lounge_ids)))
    await conn.execute(
        delete(AccessProgram).where(AccessProgram.id.not_in(list(program_ids.values())))
    )
    await conn.execute(
        delete(CardNetwork).where(
            CardNetwork.code.not_in([n.code for n in bundle.networks.card_networks])
        )
    )
    await conn.execute(
        delete(Amenity).where(Amenity.code.not_in([a.code for a in bundle.amenities.amenities]))
    )
    return LoungeSummary(
        programs=len(program_ids),
        lounges=len(lounge_ids),
        banks=len(bank_ids),
        cards=len(card_ids),
        policies=len(policy_ids),
    )
