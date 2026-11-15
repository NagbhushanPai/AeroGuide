"""Fare search (ADR-0015): validate, check the cache, ask every provider concurrently with its
own timeout, normalise, dedupe, cache, then filter and rank.

- One provider failing or timing out never fails the search while another answers.
- Only complete results are cached (every provider answered); errors never are.
- Filters and sorting run on the cached results, so changing them costs no upstream request.
- Adding a provider is one adapter plus a registry entry; nothing here changes.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.fares.budget import BudgetGuard
from app.fares.cache import CACHE_VERSION, FareCache, cache_key
from app.fares.cities import airport_pairs
from app.fares.ranking import (
    Filters,
    Weights,
    airline_options,
    apply_filters,
    connects_abroad,
    dedupe,
    sort_offers,
)
from app.models import Airport
from app.providers.fares.base import (
    BudgetExceededError,
    BudgetUnavailableError,
    FlightProvider,
    NotFoundError,
    ProviderError,
)
from app.schemas.fares import (
    BookingLink,
    BookingLinksRequest,
    BookingLinksResponse,
    BudgetStatus,
    FareQuery,
    FareSearchRequest,
    FareSearchResponse,
    Offer,
    ProviderOutcome,
)

logger = logging.getLogger(__name__)

NOTICE = (
    "Prices come from the fare source when searched and can change at any moment. The airline "
    "or booking site confirms the final price, baggage and rules before you pay."
)
DEMO_NOTICE = "Demo data: these flights and prices are generated, not real fares."

_offers = TypeAdapter(list[Offer])
_links = TypeAdapter(list[BookingLink])


class AirportCodes(Protocol):
    async def codes(self) -> frozenset[str]:
        """IATA codes of Indian airports. Raises FareSearchUnavailableError if unknown."""
        ...


class DatabaseAirportCodes:
    """Indian airports from the airports table (the seed), kept for an hour."""

    def __init__(self, engine: AsyncEngine, ttl_s: float = 3600.0) -> None:
        self._engine = engine
        self._ttl = ttl_s
        self._codes: frozenset[str] | None = None
        self._loaded = 0.0

    async def codes(self) -> frozenset[str]:
        if self._codes is not None and time.monotonic() - self._loaded < self._ttl:
            return self._codes
        try:
            async with self._engine.connect() as conn:
                rows = (await conn.execute(select(Airport.iata))).scalars().all()
        except (SQLAlchemyError, OSError) as exc:
            if self._codes is not None:
                return self._codes  # a stale list is fine; airports rarely change
            raise FareSearchUnavailableError(
                "Fare search is unavailable right now. Try again in a moment."
            ) from exc
        self._codes, self._loaded = frozenset(rows), time.monotonic()
        return self._codes


class FareSearchUnavailableError(Exception):
    """No provider could answer. `status` is the HTTP status to return."""

    def __init__(self, message: str, status: int = 503) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass(frozen=True, slots=True)
class _Result:
    provider: str
    offers: list[Offer]
    outcome: ProviderOutcome


class FareSearchService:
    def __init__(
        self,
        providers: list[FlightProvider],
        cache: FareCache,
        *,
        budget: BudgetGuard | None,
        currency_key: str,
        cache_ttl_s: int = 600,
        provider_timeout_s: float = 30.0,
        weights: Weights | None = None,
        airports: AirportCodes | None = None,
    ) -> None:
        self.providers = providers
        self._airports = airports
        self._cache = cache
        self._budget = budget
        self._currency_key = currency_key
        self._ttl = cache_ttl_s
        self._timeout = provider_timeout_s
        self._weights = weights or Weights()

    @property
    def configured(self) -> bool:
        return bool(self.providers)

    @property
    def is_demo(self) -> bool:
        return bool(self.providers) and all(p.is_demo for p in self.providers)

    # ---- search -----------------------------------------------------------------------

    async def search(self, req: FareSearchRequest) -> FareSearchResponse:
        if not self.providers:
            raise FareSearchUnavailableError("Fare search isn't set up on this server.")
        indian = await self._airports.codes() if self._airports is not None else None
        if indian is not None:
            # Checked before any upstream request, so a mistyped code costs nothing.
            unknown = [c for c in (req.origin, req.destination) if c not in indian]
            if unknown:
                raise FareSearchUnavailableError(
                    f"We search flights within India, and {', '.join(unknown)} isn't an Indian "
                    "airport we list.",
                    422,
                )
        pairs = airport_pairs(req.origin, req.destination, req.nearby_airports)
        if indian is not None:
            pairs = [(o, d) for o, d in pairs if o in indian and d in indian]
        base = FareQuery(
            origin=req.origin,
            destination=req.destination,
            departure_date=req.departure_date,
            return_date=req.return_date,
            passengers=req.passengers,
            cabin=req.cabin,
        )
        key = cache_key(pairs, base, self._currency_key, [p.name for p in self.providers])

        cached = await self._cache.get(key)
        if cached is not None:
            data = json.loads(cached)
            offers = _offers.validate_python(data["offers"])
            fetched_at = datetime.fromisoformat(data["fetched_at"])
            outcomes = [ProviderOutcome.model_validate(o) for o in data["outcomes"]]
            hit = True
        else:
            results = await asyncio.gather(*(self._ask(p, pairs, base) for p in self.providers))
            outcomes = [r.outcome for r in results]
            if all(r.outcome.status != "ok" for r in results):
                raise self._all_failed(outcomes)
            offers = dedupe(o for r in results for o in r.offers)
            fetched_at = datetime.now(UTC)
            hit = False
            if all(r.outcome.status == "ok" for r in results):
                payload = {
                    "offers": _offers.dump_python(offers, mode="json"),
                    "fetched_at": fetched_at.isoformat(),
                    "outcomes": [o.model_dump(mode="json") for o in outcomes],
                }
                await self._cache.set(key, json.dumps(payload), self._ttl)

        filters = Filters(
            max_stops=req.max_stops,
            airlines=frozenset(req.airlines),
            depart_after_hour=req.depart_after_hour,
            depart_before_hour=req.depart_before_hour,
            max_price=req.max_price,
        )
        domestic = [o for o in offers if not connects_abroad(o, indian)]
        shown = sort_offers(apply_filters(domestic, filters), req.sort, self._weights)
        return FareSearchResponse(
            origin=req.origin,
            destination=req.destination,
            departure_date=req.departure_date,
            return_date=req.return_date,
            passengers=req.passengers,
            cabin=req.cabin,
            routes=[f"{o}-{d}" for o, d in pairs],
            sort=req.sort,
            offers=shown,
            total_offers=len(domestic),
            excluded_abroad=len(offers) - len(domestic),
            airlines=airline_options(domestic),
            fetched_at=fetched_at,
            cached=hit,
            is_demo=self.is_demo,
            providers=outcomes,
            budget=await self.budget_status(),
            notice=DEMO_NOTICE if self.is_demo else NOTICE,
        )

    async def _ask(
        self, provider: FlightProvider, pairs: list[tuple[str, str]], base: FareQuery
    ) -> _Result:
        queries = [base.model_copy(update={"origin": o, "destination": d}) for o, d in pairs]
        try:
            batches = await asyncio.wait_for(
                asyncio.gather(*(provider.search(q) for q in queries)), self._timeout
            )
        except TimeoutError:
            logger.warning("fare provider %s timed out after %ss", provider.name, self._timeout)
            return _Result(
                provider.name,
                [],
                ProviderOutcome(
                    provider=provider.name,
                    status="timeout",
                    offers=0,
                    message="The fare source took too long to answer.",
                ),
            )
        except BudgetExceededError as exc:
            return _Result(
                provider.name,
                [],
                ProviderOutcome(
                    provider=provider.name, status="budget", offers=0, message=exc.message
                ),
            )
        except BudgetUnavailableError as exc:
            return _Result(
                provider.name,
                [],
                ProviderOutcome(
                    provider=provider.name, status="unavailable", offers=0, message=exc.message
                ),
            )
        except ProviderError as exc:
            return _Result(
                provider.name,
                [],
                ProviderOutcome(
                    provider=provider.name, status="error", offers=0, message=exc.message
                ),
            )
        except Exception as exc:  # a bug in one adapter must not take down the search
            logger.exception("fare provider %s crashed: %s", provider.name, type(exc).__name__)
            return _Result(
                provider.name,
                [],
                ProviderOutcome(
                    provider=provider.name,
                    status="error",
                    offers=0,
                    message="The fare source couldn't run this search.",
                ),
            )
        offers = [o for batch in batches for o in batch]
        return _Result(
            provider.name,
            offers,
            ProviderOutcome(provider=provider.name, status="ok", offers=len(offers)),
        )

    @staticmethod
    def _all_failed(outcomes: list[ProviderOutcome]) -> FareSearchUnavailableError:
        budget = next((o for o in outcomes if o.status == "budget"), None)
        if budget is not None:
            return FareSearchUnavailableError(budget.message or "Fare search is paused.", 429)
        unavailable = next((o for o in outcomes if o.status == "unavailable"), None)
        if unavailable is not None:
            return FareSearchUnavailableError(unavailable.message or "Try again shortly.", 503)
        if any(o.status == "timeout" for o in outcomes):
            return FareSearchUnavailableError(
                "The fare source took too long to answer. Try again.", 504
            )
        first = next((o.message for o in outcomes if o.message), None)
        return FareSearchUnavailableError(first or "Fare search is unavailable right now.", 502)

    async def budget_status(self) -> BudgetStatus | None:
        if self._budget is None:
            return None
        paid = [p for p in self.providers if not p.is_demo]
        if not paid:
            return None
        return await self._budget.status(paid[0].name)

    # ---- booking links ----------------------------------------------------------------

    async def booking_links(self, req: BookingLinksRequest) -> BookingLinksResponse:
        provider = next((p for p in self.providers if p.name == req.provider), None)
        if provider is None:
            raise FareSearchUnavailableError(f"Unknown fare source '{req.provider}'.", 404)
        key = f"fares:{CACHE_VERSION}:links:{req.provider}:{req.reference}"
        cached = await self._cache.get(key)
        if cached is not None:
            links = _links.validate_json(cached)
        else:
            try:
                links = await asyncio.wait_for(provider.booking_links(req.reference), self._timeout)
            except TimeoutError as exc:
                raise FareSearchUnavailableError(
                    "The fare source took too long to answer. Try again.", 504
                ) from exc
            except NotFoundError as exc:
                raise FareSearchUnavailableError(exc.message, 404) from exc
            except BudgetExceededError as exc:
                raise FareSearchUnavailableError(exc.message, 429) from exc
            except BudgetUnavailableError as exc:
                raise FareSearchUnavailableError(exc.message, 503) from exc
            except ProviderError as exc:
                raise FareSearchUnavailableError(exc.message, 502) from exc
            if links:
                await self._cache.set(key, _links.dump_json(links).decode(), self._ttl)
        return BookingLinksResponse(
            provider=req.provider,
            reference=req.reference,
            links=links,
            budget=await self.budget_status(),
        )
