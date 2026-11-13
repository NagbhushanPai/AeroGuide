"""Lounge, card and eligibility queries (read-only). Eligibility runs the pure engine on
records loaded here; nothing about the request is stored."""

from datetime import date
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.orm import aliased

from app.eligibility import engine
from app.eligibility.rules import Rule
from app.models import (
    AccessProgram,
    Airport,
    Amenity,
    Bank,
    CardNetwork,
    CreditCard,
    Lounge,
    LoungeAccessMethod,
    LoungeAmenity,
    LoungePolicy,
    PolicyRule,
    Source,
)
from app.schemas.lounges import (
    Acceptance,
    AmenityRef,
    BankRef,
    CardDetail,
    CardList,
    CardResult,
    CardSummary,
    CheckOut,
    EligibilityRequest,
    EligibilityResponse,
    LoungeDetail,
    LoungeList,
    LoungeResult,
    LoungeSummary,
    PolicyOut,
    ProgramList,
    ProgramRef,
)
from app.services.airports import _provenance, _source_columns, display_status

DISCLAIMER = (
    "An estimate from the bank's published terms as we recorded them. The bank and the lounge "
    "decide at the door: check the card's current terms and the lounge's rules before you go."
)
_rules = TypeAdapter(list[Rule])


def _in_force(valid_from: Any, valid_to: Any, on: date) -> Any:
    return and_(valid_from <= on, or_(valid_to.is_(None), valid_to > on))


# ---------------------------------------------------------------- lounges


async def _accepted_programs(
    conn: AsyncConnection, lounge_ids: list[Any], on: date
) -> dict[Any, list[tuple[str, str]]]:
    rows = (
        await conn.execute(
            select(LoungeAccessMethod.lounge_id, AccessProgram.key, AccessProgram.name)
            .join(AccessProgram, AccessProgram.id == LoungeAccessMethod.access_program_id)
            .where(LoungeAccessMethod.lounge_id.in_(lounge_ids))
            .where(_in_force(LoungeAccessMethod.valid_from, LoungeAccessMethod.valid_to, on))
            .order_by(AccessProgram.name)
        )
    ).all()
    out: dict[Any, list[tuple[str, str]]] = {}
    for r in rows:
        out.setdefault(r.lounge_id, []).append((r.key, r.name))
    return out


LOUNGE_COLUMNS = (
    Lounge.id,
    Lounge.slug,
    Lounge.name,
    Airport.iata,
    Lounge.terminal,
    Lounge.scope,
    Lounge.side,
    Lounge.verification_status,
    Lounge.verified_at,
    Lounge.reverify_after_days,
)


def _lounge_summary(r: Any, programs: list[tuple[str, str]], today: date) -> LoungeSummary:
    return LoungeSummary(
        slug=r.slug,
        name=r.name,
        iata=r.iata,
        terminal=r.terminal,
        scope=r.scope.value,
        side=r.side.value,
        status=display_status(r.verification_status, r.verified_at, r.reverify_after_days, today),
        programs=[name for _, name in programs],
    )


async def list_lounges(
    conn: AsyncConnection, *, airport: str | None, program: str | None, today: date
) -> LoungeList:
    stmt = select(*LOUNGE_COLUMNS).join(Airport, Airport.id == Lounge.airport_id)
    if airport:
        stmt = stmt.where(Airport.iata == airport.upper())
    if program:
        stmt = stmt.where(
            Lounge.id.in_(
                select(LoungeAccessMethod.lounge_id)
                .join(AccessProgram, AccessProgram.id == LoungeAccessMethod.access_program_id)
                .where(AccessProgram.key == program)
                .where(_in_force(LoungeAccessMethod.valid_from, LoungeAccessMethod.valid_to, today))
            )
        )
    rows = (await conn.execute(stmt.order_by(Airport.iata, Lounge.terminal, Lounge.name))).all()
    accepted = await _accepted_programs(conn, [r.id for r in rows], today)
    return LoungeList(items=[_lounge_summary(r, accepted.get(r.id, []), today) for r in rows])


async def get_lounge(conn: AsyncConnection, slug: str, today: date) -> LoungeDetail | None:
    src = aliased(Source)
    row = (
        await conn.execute(
            select(
                *LOUNGE_COLUMNS,
                Airport.name.label("airport_name"),
                Lounge.operator,
                Lounge.location_text,
                Lounge.nearest_gate,
                Lounge.opening_hours,
                Lounge.notes,
                *_source_columns(src, "src_"),
            )
            .join(Airport, Airport.id == Lounge.airport_id)
            .outerjoin(src, src.id == Lounge.primary_source_id)
            .where(Lounge.slug == slug)
        )
    ).one_or_none()
    if row is None:
        return None
    amenities = (
        await conn.execute(
            select(Amenity.code, Amenity.label)
            .join(LoungeAmenity, LoungeAmenity.amenity_code == Amenity.code)
            .where(LoungeAmenity.lounge_id == row.id)
            .order_by(Amenity.label)
        )
    ).all()
    asrc = aliased(Source)
    accepts = (
        await conn.execute(
            select(
                AccessProgram.key,
                AccessProgram.name,
                AccessProgram.kind,
                AccessProgram.url,
                LoungeAccessMethod.paid_price,
                LoungeAccessMethod.currency,
                LoungeAccessMethod.paid_duration_min,
                LoungeAccessMethod.valid_from,
                LoungeAccessMethod.valid_to,
                LoungeAccessMethod.verification_status,
                LoungeAccessMethod.verified_at,
                LoungeAccessMethod.reverify_after_days,
                LoungeAccessMethod.notes,
                *_source_columns(asrc, "src_"),
            )
            .join(AccessProgram, AccessProgram.id == LoungeAccessMethod.access_program_id)
            .outerjoin(asrc, asrc.id == LoungeAccessMethod.primary_source_id)
            .where(LoungeAccessMethod.lounge_id == row.id)
            .order_by(AccessProgram.name, LoungeAccessMethod.valid_from.desc())
        )
    ).all()
    current = [
        (a.key, a.name)
        for a in accepts
        if a.valid_from <= today and (a.valid_to is None or a.valid_to > today)
    ]
    summary = _lounge_summary(row, current, today)
    return LoungeDetail(
        **summary.model_dump(),
        airport_name=row.airport_name,
        operator=row.operator,
        location_text=row.location_text,
        nearest_gate=row.nearest_gate,
        opening_hours=row.opening_hours,
        amenities=[AmenityRef(code=a.code, label=a.label) for a in amenities],
        accepts=[
            Acceptance(
                program=ProgramRef(key=a.key, name=a.name, kind=a.kind.value, url=a.url),
                paid_price=float(a.paid_price) if a.paid_price is not None else None,
                currency=a.currency,
                paid_duration_min=a.paid_duration_min,
                valid_from=a.valid_from,
                valid_to=a.valid_to,
                provenance=_provenance(a, today),
            )
            for a in accepts
        ],
        provenance=_provenance(row, today),
    )


# ---------------------------------------------------------------- cards


CARD_COLUMNS = (
    CreditCard.id,
    CreditCard.slug,
    CreditCard.name,
    CreditCard.verification_status,
    CreditCard.verified_at,
    CreditCard.reverify_after_days,
    Bank.slug.label("bank_slug"),
    Bank.name.label("bank_name"),
    Bank.url.label("bank_url"),
    CardNetwork.name.label("network"),
)


def _card_query() -> Any:
    return (
        select(*CARD_COLUMNS)
        .join(Bank, Bank.id == CreditCard.bank_id)
        .join(CardNetwork, CardNetwork.code == CreditCard.network_code)
    )


async def _current_summaries(
    conn: AsyncConnection, card_ids: list[Any], on: date
) -> dict[tuple[Any, str], str]:
    rows = (
        await conn.execute(
            select(LoungePolicy.card_id, LoungePolicy.scope, LoungePolicy.summary)
            .where(LoungePolicy.card_id.in_(card_ids))
            .where(_in_force(LoungePolicy.valid_from, LoungePolicy.valid_to, on))
        )
    ).all()
    return {(r.card_id, r.scope.value): r.summary for r in rows}


def _card_summary(r: Any, summaries: dict[tuple[Any, str], str], today: date) -> CardSummary:
    return CardSummary(
        slug=r.slug,
        name=r.name,
        bank=BankRef(slug=r.bank_slug, name=r.bank_name, url=r.bank_url),
        network=r.network,
        status=display_status(r.verification_status, r.verified_at, r.reverify_after_days, today),
        domestic=summaries.get((r.id, "domestic")),
        international=summaries.get((r.id, "international")),
    )


async def list_cards(conn: AsyncConnection, *, bank: str | None, today: date) -> CardList:
    stmt = _card_query()
    if bank:
        stmt = stmt.where(Bank.slug == bank)
    rows = (await conn.execute(stmt.order_by(Bank.name, CreditCard.name))).all()
    summaries = await _current_summaries(conn, [r.id for r in rows], today)
    banks = (await conn.execute(select(Bank.slug, Bank.name, Bank.url).order_by(Bank.name))).all()
    return CardList(
        items=[_card_summary(r, summaries, today) for r in rows],
        banks=[BankRef(slug=b.slug, name=b.name, url=b.url) for b in banks],
    )


async def get_card(conn: AsyncConnection, slug: str, today: date) -> CardDetail | None:
    src = aliased(Source)
    row = (
        await conn.execute(
            _card_query()
            .add_columns(CreditCard.product_url, CreditCard.notes, *_source_columns(src, "src_"))
            .outerjoin(src, src.id == CreditCard.primary_source_id)
            .where(CreditCard.slug == slug)
        )
    ).one_or_none()
    if row is None:
        return None
    psrc = aliased(Source)
    policies = (
        await conn.execute(
            select(
                LoungePolicy.id,
                LoungePolicy.scope,
                LoungePolicy.valid_from,
                LoungePolicy.valid_to,
                LoungePolicy.summary,
                LoungePolicy.unmodelled_terms,
                LoungePolicy.verification_status,
                LoungePolicy.verified_at,
                LoungePolicy.reverify_after_days,
                LoungePolicy.notes,
                *_source_columns(psrc, "src_"),
            )
            .outerjoin(psrc, psrc.id == LoungePolicy.primary_source_id)
            .where(LoungePolicy.card_id == row.id)
            .order_by(LoungePolicy.scope, LoungePolicy.valid_from.desc())
        )
    ).all()
    rules = await _rules_by_policy(conn, [p.id for p in policies])
    summaries = await _current_summaries(conn, [row.id], today)
    return CardDetail(
        **_card_summary(row, summaries, today).model_dump(),
        product_url=row.product_url,
        provenance=_provenance(row, today),
        policies=[
            PolicyOut(
                scope=p.scope.value,
                valid_from=p.valid_from,
                valid_to=p.valid_to,
                in_force=p.valid_from <= today and (p.valid_to is None or p.valid_to > today),
                summary=p.summary,
                rules=rules.get(p.id, []),
                unmodelled_terms=p.unmodelled_terms,
                provenance=_provenance(p, today),
            )
            for p in policies
        ],
    )


async def _rules_by_policy(
    conn: AsyncConnection, policy_ids: list[Any]
) -> dict[Any, list[dict[str, Any]]]:
    rows = (
        await conn.execute(
            select(PolicyRule.policy_id, PolicyRule.rule)
            .where(PolicyRule.policy_id.in_(policy_ids))
            .order_by(PolicyRule.policy_id, PolicyRule.position)
        )
    ).all()
    out: dict[Any, list[dict[str, Any]]] = {}
    for r in rows:
        out.setdefault(r.policy_id, []).append(r.rule)
    return out


async def list_programs(conn: AsyncConnection) -> ProgramList:
    rows = (
        await conn.execute(
            select(
                AccessProgram.key, AccessProgram.name, AccessProgram.kind, AccessProgram.url
            ).order_by(AccessProgram.name)
        )
    ).all()
    return ProgramList(
        items=[ProgramRef(key=p.key, name=p.name, kind=p.kind.value, url=p.url) for p in rows]
    )


# ---------------------------------------------------------------- eligibility


async def check_eligibility(
    conn: AsyncConnection, req: EligibilityRequest, today: date
) -> EligibilityResponse | None:
    """None when the airport is unknown."""
    on = req.on or today
    iata = req.airport.upper()
    airport_id = (
        await conn.execute(select(Airport.id).where(Airport.iata == iata))
    ).scalar_one_or_none()
    if airport_id is None:
        return None

    lounge_rows = (
        await conn.execute(
            select(*LOUNGE_COLUMNS)
            .join(Airport, Airport.id == Lounge.airport_id)
            .where(Lounge.airport_id == airport_id)
            .order_by(Lounge.terminal, Lounge.name)
        )
    ).all()
    acceptance_rows = (
        await conn.execute(
            select(
                LoungeAccessMethod.lounge_id,
                AccessProgram.key,
                LoungeAccessMethod.valid_from,
                LoungeAccessMethod.valid_to,
            )
            .join(AccessProgram, AccessProgram.id == LoungeAccessMethod.access_program_id)
            .where(LoungeAccessMethod.lounge_id.in_([r.id for r in lounge_rows]))
        )
    ).all()
    accepted_today = await _accepted_programs(conn, [r.id for r in lounge_rows], on)
    lounges = [
        (
            _lounge_summary(r, accepted_today.get(r.id, []), today),
            engine.Lounge(
                slug=r.slug,
                iata=iata,
                scope=r.scope.value,
                accepts=tuple(
                    engine.Acceptance(a.key, a.valid_from, a.valid_to)
                    for a in acceptance_rows
                    if a.lounge_id == r.id
                ),
            ),
        )
        for r in lounge_rows
    ]

    card_rows = (await conn.execute(_card_query().where(CreditCard.slug.in_(req.cards)))).all()
    found = {r.slug for r in card_rows}
    policy_rows = (
        await conn.execute(
            select(
                LoungePolicy.id,
                LoungePolicy.card_id,
                LoungePolicy.scope,
                LoungePolicy.valid_from,
                LoungePolicy.valid_to,
                LoungePolicy.summary,
                LoungePolicy.unmodelled_terms,
            ).where(LoungePolicy.card_id.in_([r.id for r in card_rows]))
        )
    ).all()
    rules = await _rules_by_policy(conn, [p.id for p in policy_rows])
    summaries = await _current_summaries(conn, [r.id for r in card_rows], today)
    trip = engine.Trip(on=on, scope=req.scope, guests=req.guests)

    results: list[CardResult] = []
    for card in sorted(card_rows, key=lambda r: req.cards.index(r.slug)):
        policies = [
            engine.Policy(
                id=str(p.id),
                scope=p.scope.value,
                valid_from=p.valid_from,
                valid_to=p.valid_to,
                rules=tuple(_rules.validate_python(rules.get(p.id, []))),
                unmodelled_terms=p.unmodelled_terms,
            )
            for p in policy_rows
            if p.card_id == card.id
        ]
        summary_by_id = {str(p.id): p.summary for p in policy_rows}
        user = req.facts.get(card.slug)
        facts = engine.Facts(
            visits_used=user.visits_used if user else None,
            spend_inr=user.spend_inr if user else None,
        )
        lounge_results = []
        for summary, lounge in lounges:
            d = engine.evaluate(policies, lounge, trip, facts)
            lounge_results.append(
                LoungeResult(
                    lounge=summary,
                    status=d.status.value,
                    checks=[
                        CheckOut(rule=c.rule, status=c.status.value, message=c.message)
                        for c in d.checks
                    ],
                    via_programs=list(d.via_programs),
                    guests_covered=d.guests_covered,
                    entry=list(d.entry),
                    policy_summary=summary_by_id.get(d.policy_id) if d.policy_id else None,
                )
            )
        results.append(
            CardResult(card=_card_summary(card, summaries, today), lounges=lounge_results)
        )

    return EligibilityResponse(
        airport=iata,
        on=on,
        scope=req.scope,
        lounges_listed=len(lounges),
        results=results,
        unknown_cards=[s for s in req.cards if s not in found],
        disclaimer=DISCLAIMER,
    )
