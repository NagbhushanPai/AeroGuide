"""Lounge, card and eligibility queries (read-only). Eligibility runs the pure engine on
records loaded here; nothing about the request is stored.

Lounges, acceptances, cards and policies are small and change only when the seed runs, so
they are loaded together into an in-process catalogue kept for CATALOGUE_TTL_S. Eligibility,
"cards that get in", "lounges this card opens" and search all read from it, which saves
several sequential round trips to a database in another region. Pages that show provenance
still query the database directly.
"""

import asyncio
import time
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.orm import aliased

from app.eligibility import engine
from app.eligibility.rules import ProgramEntitlement, Rule
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
    CardAccess,
    CardDetail,
    CardList,
    CardLounges,
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
    ProgramBrief,
    ProgramList,
    ProgramRef,
    ScopePrograms,
    SearchHit,
)
from app.services.airports import _provenance, _source_columns, display_status

DISCLAIMER = (
    "An estimate from the bank's published terms as we recorded them. The bank and the lounge "
    "decide at the door: check the card's current terms and the lounge's rules before you go."
)
CATALOGUE_TTL_S = 300.0
_rules = TypeAdapter(list[Rule])


def _in_force(valid_from: Any, valid_to: Any, on: date) -> Any:
    return and_(valid_from <= on, or_(valid_to.is_(None), valid_to > on))


def _active(valid_from: date, valid_to: date | None, on: date) -> bool:
    return valid_from <= on and (valid_to is None or on < valid_to)


# ---------------------------------------------------------------- catalogue


@dataclass(frozen=True, slots=True)
class _Status:
    verification_status: Any
    verified_at: date | None
    reverify_after_days: int

    def display(self, today: date) -> Any:
        return display_status(
            self.verification_status, self.verified_at, self.reverify_after_days, today
        )


@dataclass(frozen=True, slots=True)
class CatLounge:
    slug: str
    name: str
    iata: str
    airport_name: str
    city: str | None
    terminal: str | None
    scope: str
    side: str
    direction: str
    status: _Status
    accepts: tuple[engine.Acceptance, ...]

    def engine_lounge(self) -> engine.Lounge:
        return engine.Lounge(
            self.slug,
            self.iata,
            self.scope,  # type: ignore[arg-type]
            self.accepts,
            self.direction,  # type: ignore[arg-type]
        )


@dataclass(frozen=True, slots=True)
class CatPolicy:
    policy: engine.Policy
    summary: str


@dataclass(frozen=True, slots=True)
class CatCard:
    slug: str
    name: str
    bank: BankRef
    network: str | None
    status: _Status
    policies: tuple[CatPolicy, ...]

    def in_force(self, scope: str, on: date) -> CatPolicy | None:
        return next(
            (p for p in self.policies if p.policy.scope == scope and p.policy.in_force(on)), None
        )


@dataclass(frozen=True, slots=True)
class CatAirport:
    iata: str
    name: str
    city: str | None
    state: str | None


@dataclass(slots=True)
class Catalogue:
    programs: dict[str, str]  # key -> name
    lounges: list[CatLounge]
    cards: dict[str, CatCard]
    banks: list[BankRef]
    airports: list[CatAirport]
    loaded_at: float = field(default_factory=time.monotonic)

    def mapped_programs(self, on: date) -> frozenset[str]:
        """Programmes with at least one lounge accepting them on the date."""
        return frozenset(a.program for lg in self.lounges for a in lg.accepts if a.in_force(on))


_cache: dict[str, Catalogue] = {}
_lock = asyncio.Lock()


def clear_catalogue() -> None:
    """Forget the cached catalogue (the seed calls this after writing)."""
    _cache.clear()


async def catalogue(conn: AsyncConnection) -> Catalogue:
    key = str(conn.engine.url)
    cached = _cache.get(key)
    if cached is not None and time.monotonic() - cached.loaded_at < CATALOGUE_TTL_S:
        return cached
    async with _lock:
        cached = _cache.get(key)
        if cached is not None and time.monotonic() - cached.loaded_at < CATALOGUE_TTL_S:
            return cached
        fresh = await _load_catalogue(conn)
        _cache[key] = fresh
        return fresh


async def _load_catalogue(conn: AsyncConnection) -> Catalogue:
    programs = {
        r.key: r.name
        for r in (await conn.execute(select(AccessProgram.key, AccessProgram.name))).all()
    }
    acceptance_rows = (
        await conn.execute(
            select(
                LoungeAccessMethod.lounge_id,
                AccessProgram.key,
                LoungeAccessMethod.valid_from,
                LoungeAccessMethod.valid_to,
            ).join(AccessProgram, AccessProgram.id == LoungeAccessMethod.access_program_id)
        )
    ).all()
    accepts: dict[Any, list[engine.Acceptance]] = {}
    for a in acceptance_rows:
        accepts.setdefault(a.lounge_id, []).append(
            engine.Acceptance(a.key, a.valid_from, a.valid_to)
        )
    lounge_rows = (
        await conn.execute(
            select(
                Lounge.id,
                Lounge.slug,
                Lounge.name,
                Airport.iata,
                Airport.name.label("airport_name"),
                Airport.city,
                Lounge.terminal,
                Lounge.scope,
                Lounge.side,
                Lounge.direction,
                Lounge.verification_status,
                Lounge.verified_at,
                Lounge.reverify_after_days,
            )
            .join(Airport, Airport.id == Lounge.airport_id)
            .order_by(Airport.iata, Lounge.terminal, Lounge.name)
        )
    ).all()
    lounges = [
        CatLounge(
            slug=r.slug,
            name=r.name,
            iata=r.iata,
            airport_name=r.airport_name,
            city=r.city,
            terminal=r.terminal,
            scope=r.scope.value,
            side=r.side.value,
            direction=r.direction.value,
            status=_Status(r.verification_status, r.verified_at, r.reverify_after_days),
            accepts=tuple(accepts.get(r.id, [])),
        )
        for r in lounge_rows
    ]

    card_rows = (await conn.execute(_card_query().order_by(Bank.name, CreditCard.name))).all()
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
            )
        )
    ).all()
    rules = await _rules_by_policy(conn, [p.id for p in policy_rows])
    by_card: dict[Any, list[CatPolicy]] = {}
    for p in policy_rows:
        by_card.setdefault(p.card_id, []).append(
            CatPolicy(
                engine.Policy(
                    id=str(p.id),
                    scope=p.scope.value,
                    valid_from=p.valid_from,
                    valid_to=p.valid_to,
                    rules=tuple(_rules.validate_python(rules.get(p.id, []))),
                    unmodelled_terms=p.unmodelled_terms,
                ),
                p.summary,
            )
        )
    cards = {
        r.slug: CatCard(
            slug=r.slug,
            name=r.name,
            bank=BankRef(slug=r.bank_slug, name=r.bank_name, url=r.bank_url),
            network=r.network,
            status=_Status(r.verification_status, r.verified_at, r.reverify_after_days),
            policies=tuple(by_card.get(r.id, [])),
        )
        for r in card_rows
    }
    banks = [
        BankRef(slug=b.slug, name=b.name, url=b.url)
        for b in (await conn.execute(select(Bank.slug, Bank.name, Bank.url).order_by(Bank.name)))
    ]
    airports = [
        CatAirport(a.iata, a.name, a.city, a.state)
        for a in (
            await conn.execute(
                select(Airport.iata, Airport.name, Airport.city, Airport.state).order_by(
                    Airport.has_guide.desc(), Airport.name
                )
            )
        )
    ]
    return Catalogue(programs, lounges, cards, banks, airports)


def _brief(cat: Catalogue, keys: Iterable[str]) -> list[ProgramBrief]:
    return sorted(
        (ProgramBrief(key=k, name=cat.programs.get(k, k)) for k in dict.fromkeys(keys)),
        key=lambda p: p.name,
    )


def _summary(cat: Catalogue, lg: CatLounge, on: date, today: date) -> LoungeSummary:
    return LoungeSummary(
        slug=lg.slug,
        name=lg.name,
        iata=lg.iata,
        airport_name=lg.airport_name,
        city=lg.city,
        terminal=lg.terminal,
        scope=lg.scope,
        side=lg.side,
        direction=lg.direction,
        status=lg.status.display(today),
        programs=_brief(cat, (a.program for a in lg.accepts if a.in_force(on))),
    )


def _card_summary_cat(card: CatCard, today: date) -> CardSummary:
    dom = card.in_force("domestic", today)
    intl = card.in_force("international", today)
    return CardSummary(
        slug=card.slug,
        name=card.name,
        bank=card.bank,
        network=card.network,
        status=card.status.display(today),
        domestic=dom.summary if dom else None,
        international=intl.summary if intl else None,
    )


def _programs_of(policy: engine.Policy) -> list[str]:
    return [r.program for r in policy.rules if isinstance(r, ProgramEntitlement)]


# ---------------------------------------------------------------- lounges


async def list_lounges(
    conn: AsyncConnection, *, airport: str | None, program: str | None, today: date
) -> LoungeList:
    cat = await catalogue(conn)
    items = [
        lg
        for lg in cat.lounges
        if (not airport or lg.iata == airport.upper())
        and (not program or any(a.program == program and a.in_force(today) for a in lg.accepts))
    ]
    return LoungeList(items=[_summary(cat, lg, today, today) for lg in items])


def _cards_for_lounge(cat: Catalogue, lg: CatLounge, today: date) -> list[CardAccess]:
    if lg.direction != "departures":
        return []
    accepted = {a.program for a in lg.accepts if a.in_force(today)}
    scopes = ("domestic", "international") if lg.scope == "both" else (lg.scope,)
    out: list[CardAccess] = []
    for card in cat.cards.values():
        for scope in scopes:
            pol = card.in_force(scope, today)
            if pol is None:
                continue
            via = next((k for k in _programs_of(pol.policy) if k in accepted), None)
            if via is None:
                continue
            out.append(
                CardAccess(
                    slug=card.slug,
                    name=card.name,
                    bank=card.bank.name,
                    status=card.status.display(today),
                    scope=scope,
                    via=ProgramBrief(key=via, name=cat.programs.get(via, via)),
                )
            )
    return sorted(out, key=lambda c: (c.bank, c.name, c.scope))


async def get_lounge(conn: AsyncConnection, slug: str, today: date) -> LoungeDetail | None:
    cat = await catalogue(conn)
    lg = next((x for x in cat.lounges if x.slug == slug), None)
    if lg is None:
        return None
    src = aliased(Source)
    row = (
        await conn.execute(
            select(
                Lounge.id,
                Lounge.operator,
                Lounge.location_text,
                Lounge.nearest_gate,
                Lounge.opening_hours,
                Lounge.notes,
                Lounge.verification_status,
                Lounge.verified_at,
                Lounge.reverify_after_days,
                *_source_columns(src, "src_"),
            )
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
    return LoungeDetail(
        **_summary(cat, lg, today, today).model_dump(),
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
                in_force=_active(a.valid_from, a.valid_to, today),
                provenance=_provenance(a, today),
            )
            for a in accepts
        ],
        cards=_cards_for_lounge(cat, lg, today),
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
        .outerjoin(CardNetwork, CardNetwork.code == CreditCard.network_code)
    )


async def list_cards(conn: AsyncConnection, *, bank: str | None, today: date) -> CardList:
    cat = await catalogue(conn)
    return CardList(
        items=[
            _card_summary_cat(c, today)
            for c in cat.cards.values()
            if not bank or c.bank.slug == bank
        ],
        banks=cat.banks,
    )


def _scope_programs(cat: Catalogue, card: CatCard, today: date) -> list[ScopePrograms]:
    mapped = cat.mapped_programs(today)
    out = []
    for scope in ("domestic", "international"):
        pol = card.in_force(scope, today)
        if pol is None:
            continue
        keys = _programs_of(pol.policy)
        out.append(
            ScopePrograms(
                scope=scope,
                programs=_brief(cat, keys),
                lounge_list_known=bool(keys) and set(keys) <= mapped,
            )
        )
    return out


async def get_card(conn: AsyncConnection, slug: str, today: date) -> CardDetail | None:
    cat = await catalogue(conn)
    card = cat.cards.get(slug)
    if card is None:
        return None
    src = aliased(Source)
    row = (
        await conn.execute(
            select(
                CreditCard.id,
                CreditCard.product_url,
                CreditCard.notes,
                CreditCard.verification_status,
                CreditCard.verified_at,
                CreditCard.reverify_after_days,
                *_source_columns(src, "src_"),
            )
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
    return CardDetail(
        **_card_summary_cat(card, today).model_dump(),
        product_url=row.product_url,
        provenance=_provenance(row, today),
        policies=[
            PolicyOut(
                scope=p.scope.value,
                valid_from=p.valid_from,
                valid_to=p.valid_to,
                in_force=_active(p.valid_from, p.valid_to, today),
                summary=p.summary,
                rules=rules.get(p.id, []),
                unmodelled_terms=p.unmodelled_terms,
                provenance=_provenance(p, today),
            )
            for p in policies
        ],
        programs=_scope_programs(cat, card, today),
    )


async def card_lounges(conn: AsyncConnection, slug: str, today: date) -> CardLounges | None:
    """Departure lounges accepting a programme the card's benefits in force today name."""
    cat = await catalogue(conn)
    card = cat.cards.get(slug)
    if card is None:
        return None
    scopes = _scope_programs(cat, card, today)
    wanted: dict[str, set[str]] = {s.scope: {p.key for p in s.programs} for s in scopes}
    lounges = []
    for lg in cat.lounges:
        if lg.direction != "departures":
            continue
        accepted = {a.program for a in lg.accepts if a.in_force(today)}
        lounge_scopes = ("domestic", "international") if lg.scope == "both" else (lg.scope,)
        if any(wanted.get(s, set()) & accepted for s in lounge_scopes):
            lounges.append(_summary(cat, lg, today, today))
    return CardLounges(card=slug, scopes=scopes, lounges=lounges)


async def _rules_by_policy(
    conn: AsyncConnection, policy_ids: list[Any]
) -> dict[Any, list[dict[str, Any]]]:
    if not policy_ids:
        return {}
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


# ---------------------------------------------------------------- search


def _score(q: str, *fields: str | None) -> int | None:
    """0 = exact code, 1 = prefix of a word, 2 = substring. None = no match."""
    best: int | None = None
    for i, f in enumerate(fields):
        if not f:
            continue
        low = f.lower()
        if i == 0 and low == q:
            return 0
        if low.startswith(q) or any(w.startswith(q) for w in low.replace("-", " ").split()):
            best = 1 if best is None else min(best, 1)
        elif q in low:
            best = 2 if best is None else min(best, 2)
    return best


async def search(conn: AsyncConnection, q: str, limit: int, today: date) -> list[SearchHit]:
    """Airports, lounges and cards matching every word of `q`, best matches first."""
    cat = await catalogue(conn)
    words = [w for w in q.lower().split() if w]
    if not words:
        return []
    scored: list[tuple[int, int, SearchHit]] = []

    def consider(kind_rank: int, hit: SearchHit, *fields: str | None) -> None:
        scores = [_score(w, *fields) for w in words]
        if all(s is not None for s in scores):
            scored.append((sum(s for s in scores if s is not None), kind_rank, hit))

    for a in cat.airports:
        consider(
            0,
            SearchHit(
                kind="airport",
                key=a.iata,
                title=f"{a.name} ({a.iata})",
                subtitle=", ".join(x for x in (a.city, a.state) if x) or None,
                href=f"/airports/{a.iata}",
            ),
            a.iata,
            a.name,
            a.city,
            a.state,
        )
    for lg in cat.lounges:
        consider(
            1,
            SearchHit(
                kind="lounge",
                key=lg.slug,
                title=lg.name,
                subtitle=" · ".join(
                    x for x in (lg.city or lg.airport_name, lg.iata, lg.terminal) if x
                ),
                href=f"/lounges/{lg.slug}",
            ),
            lg.iata,
            lg.name,
            lg.city,
            lg.airport_name,
            lg.terminal,
        )
    for c in cat.cards.values():
        consider(
            2,
            SearchHit(
                kind="card",
                key=c.slug,
                title=c.name,
                subtitle=c.bank.name,
                href=f"/cards/{c.slug}",
            ),
            None,
            c.name,
            c.bank.name,
            c.network,
        )
    scored.sort(key=lambda t: (t[0], t[1], t[2].title))
    return [h for _, _, h in scored[:limit]]


# ---------------------------------------------------------------- eligibility


async def check_eligibility(
    conn: AsyncConnection, req: EligibilityRequest, today: date
) -> EligibilityResponse | None:
    """None when the airport is unknown."""
    cat = await catalogue(conn)
    on = req.on or today
    iata = req.airport.upper()
    if not any(a.iata == iata for a in cat.airports):
        return None

    # Arrivals and transit lounges aren't for departing passengers: leave them out.
    lounges = [lg for lg in cat.lounges if lg.iata == iata and lg.direction == "departures"]
    mapped = cat.mapped_programs(on)
    trip = engine.Trip(on=on, scope=req.scope, guests=req.guests)
    slugs = list(dict.fromkeys(req.cards))

    results: list[CardResult] = []
    for slug in slugs:
        card = cat.cards.get(slug)
        if card is None:
            continue
        policies = [p.policy for p in card.policies]
        summary_by_id = {p.policy.id: p.summary for p in card.policies}
        user = req.facts.get(slug)
        facts = engine.Facts(
            visits_used=user.visits_used if user else None,
            spend_inr=user.spend_inr if user else None,
        )
        lounge_results = []
        for lg in lounges:
            d = engine.evaluate(policies, lg.engine_lounge(), trip, facts, mapped, cat.programs)
            lounge_results.append(
                LoungeResult(
                    lounge=_summary(cat, lg, on, today),
                    status=d.status.value,
                    checks=[
                        CheckOut(
                            rule=c.rule, status=c.status.value, message=c.message, detail=c.detail
                        )
                        for c in d.checks
                    ],
                    via_programs=list(d.via_programs),
                    guests_covered=d.guests_covered,
                    entry=list(d.entry),
                    notes=list(d.notes),
                    policy_summary=summary_by_id.get(d.policy_id) if d.policy_id else None,
                )
            )
        results.append(CardResult(card=_card_summary_cat(card, today), lounges=lounge_results))

    return EligibilityResponse(
        airport=iata,
        on=on,
        scope=req.scope,
        lounges_listed=len(lounges),
        results=results,
        unknown_cards=[s for s in slugs if s not in cat.cards],
        disclaimer=DISCLAIMER,
    )
