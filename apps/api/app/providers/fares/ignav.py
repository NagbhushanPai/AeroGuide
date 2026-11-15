"""Ignav fare search (https://ignav.com/docs, OpenAPI at https://ignav.com/api/openapi.json).

- Auth: `X-Api-Key` header. The key is never logged.
- `market` (two-letter country code, IN) sets currency and locale when a market-local fare
  exists; otherwise prices come back in another currency and are shown as returned.
- Every request reserves one unit of the request budget first (retries too), so the cap holds.
- Retries only the errors Ignav documents as transient (unable_to_complete_request,
  server_busy, billing_period_unavailable), network errors, timeouts and other 5xx. Never a 4xx.
- Requests are paced (minimum gap, limited concurrency) to stay polite.
- Ignav's airport search is billable, so it is never used: airport autocomplete comes from
  AeroGuide's own airport data.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from app.fares.budget import BudgetGuard
from app.fares.ranking import AIRLINE_NAMES, flights_signature, offer_id
from app.providers.fares.base import NotFoundError, ProviderError
from app.schemas.fares import (
    BookingLink,
    BookingRef,
    BudgetStatus,
    FareQuery,
    Leg,
    Offer,
    Segment,
)

logger = logging.getLogger(__name__)

NAME = "ignav"
BASE_URL = "https://ignav.com/api"
# Documented as transient. Everything else in 4xx needs a different request.
RETRYABLE_CODES = {"unable_to_complete_request", "server_busy", "billing_period_unavailable"}
MAX_RETRY_AFTER_S = 5.0

# Messages safe to show to users, by Ignav error code.
_MESSAGES = {
    "invalid_airport_code": "The fare source doesn't recognise one of these airports.",
    "duplicate_route_airports": "Origin and destination must be different airports.",
    "departure_date_in_past": "The departure date is in the past.",
    "invalid_date_range": "The return date must be after the departure date.",
    "too_many_passengers": "At most 9 passengers can be searched together.",
    "invalid_infants_on_lap": "Each infant on a lap needs an adult.",
    "unsupported_search": "The fare source can't search these dates yet.",
    "unsupported_market": "The fare source doesn't support the Indian market right now.",
    "billing_required": "Fare search is paused: the fare source's free allowance is used up.",
    "billing_blocked": "Fare search is paused because of a billing problem at the fare source.",
    "monthly_spend_limit_reached": "Fare search is paused: the monthly spending limit is reached.",
    "unable_to_complete_request": "The fare source couldn't complete the search. Try again.",
    "server_busy": "The fare source is busy. Try again in a moment.",
    "ignav_id_not_found": "This fare has expired. Search again for current prices.",
    "itinerary_not_found": "This fare has no booking links any more. Search again.",
}
_DEFAULT_MESSAGE = "The fare source couldn't run this search."
_AUTH_MESSAGE = "Fare search isn't available right now."


# ---- Ignav response shapes (only the fields we use; unknown fields are ignored) -------------


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Seg(_Model):
    marketing_carrier_code: str | None = None
    flight_number: str | None = None
    operating_carrier_name: str | None = None
    departure_airport: str
    departure_time_local: str
    departure_timezone: str | None = None
    departure_time_utc: str | None = None
    arrival_airport: str
    arrival_time_local: str
    arrival_timezone: str | None = None
    arrival_time_utc: str | None = None
    duration_minutes: int
    aircraft: str | None = None


class _Leg(_Model):
    carrier: str | None = None
    duration_minutes: int | None = None
    segments: list[_Seg]


class _Price(_Model):
    amount: float
    currency: str
    status: str


class _Itinerary(_Model):
    price: _Price
    outbound: _Leg
    inbound: _Leg | None = None
    cabin_class: str | None = None
    has_mixed_carriers: bool | None = None
    ignav_id: str


class _Link(_Model):
    provider_name: str
    provider_type: str | None = None
    fare_name: str | None = None
    price: _Price | None = None
    url: str


class _Option(_Model):
    links: list[_Link]


# ---- normalisation ----------------------------------------------------------------------


def _utc(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _flight_number(code: str | None, number: str | None) -> str | None:
    if not number:
        return None
    number = "".join(number.split()).upper()
    if code and not number.startswith(code.upper()):
        return f"{code.upper()}{number}"
    return number


def _segment(s: _Seg) -> Segment:
    code = s.marketing_carrier_code.upper() if s.marketing_carrier_code else None
    return Segment(
        carrier_code=code,
        carrier_name=(AIRLINE_NAMES.get(code) if code else None) or s.operating_carrier_name,
        flight_number=_flight_number(code, s.flight_number),
        origin=s.departure_airport,
        destination=s.arrival_airport,
        departure_local=s.departure_time_local,
        departure_timezone=s.departure_timezone,
        departure_utc=_utc(s.departure_time_utc),
        arrival_local=s.arrival_time_local,
        arrival_timezone=s.arrival_timezone,
        arrival_utc=_utc(s.arrival_time_utc),
        duration_minutes=s.duration_minutes,
        aircraft=s.aircraft,
    )


def _leg(raw: _Leg) -> Leg:
    if not raw.segments:
        raise ValueError("leg without segments")
    segs = [_segment(s) for s in raw.segments]
    first, last = segs[0], segs[-1]
    duration = raw.duration_minutes
    if duration is None and first.departure_utc and last.arrival_utc:
        duration = int((last.arrival_utc - first.departure_utc).total_seconds() // 60)
    if duration is None:
        duration = sum(s.duration_minutes for s in segs)
    carriers = list(dict.fromkeys(s.carrier_code for s in segs if s.carrier_code))
    names = list(dict.fromkeys(s.carrier_name for s in segs if s.carrier_name))
    return Leg(
        origin=first.origin,
        destination=last.destination,
        departure_local=first.departure_local,
        departure_timezone=first.departure_timezone,
        arrival_local=last.arrival_local,
        arrival_timezone=last.arrival_timezone,
        duration_minutes=duration,
        stops=len(segs) - 1,
        carriers=carriers,
        carrier_names=names,
        flight_numbers=[s.flight_number for s in segs if s.flight_number],
        segments=segs,
    )


def normalise(data: dict[str, Any], query: FareQuery, provider: str = NAME) -> list[Offer]:
    """Ignav fare search response -> offers. A malformed itinerary is skipped, not fatal."""
    fetched_at = _utc(data.get("observed_at")) or datetime.now(UTC)
    offers: list[Offer] = []
    skipped = 0
    for raw in data.get("itineraries") or []:
        try:
            it = _Itinerary.model_validate(raw)
            outbound = _leg(it.outbound)
            inbound = _leg(it.inbound) if it.inbound else None
        except (ValidationError, ValueError):
            skipped += 1
            continue
        offer = Offer(
            id="",
            provider=provider,
            is_demo=False,
            price=it.price.amount,
            currency=it.price.currency.upper(),
            price_verified=it.price.status == "verified",
            cabin=it.cabin_class or query.cabin,
            outbound=outbound,
            inbound=inbound,
            total_duration_minutes=outbound.duration_minutes
            + (inbound.duration_minutes if inbound else 0),
            stops=max(outbound.stops, inbound.stops if inbound else 0),
            mixed_carriers=bool(it.has_mixed_carriers),
            fetched_at=fetched_at,
            booking=BookingRef(provider=provider, reference=it.ignav_id),
        )
        offers.append(
            offer.model_copy(
                update={"id": offer_id(provider, flights_signature(offer), offer.cabin)}
            )
        )
    if skipped:
        logger.info("ignav: skipped %d malformed itineraries", skipped)
    return offers


def _links(data: dict[str, Any]) -> list[BookingLink]:
    out: dict[str, BookingLink] = {}
    for raw in data.get("booking_options") or []:
        try:
            option = _Option.model_validate(raw)
        except ValidationError:
            continue
        for link in option.links:
            if not link.url.startswith("https://") or link.url in out:
                continue
            out[link.url] = BookingLink(
                seller=link.provider_name,
                seller_type=link.provider_type,
                fare_name=link.fare_name,
                price=link.price.amount if link.price else None,
                currency=link.price.currency.upper() if link.price else None,
                url=link.url,
            )
    return sorted(out.values(), key=lambda b: (b.price is None, b.price or 0.0, b.seller))


# ---- provider ---------------------------------------------------------------------------


class IgnavProvider:
    name = NAME
    is_demo = False

    def __init__(
        self,
        client: httpx.AsyncClient,
        api_key: str,
        budget: BudgetGuard,
        *,
        market: str = "IN",
        base_url: str = BASE_URL,
        timeout_s: float = 20.0,
        max_retries: int = 2,
        min_interval_s: float = 0.5,
        max_concurrent: int = 2,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not api_key:
            raise ValueError("IGNAV_API_KEY is required for the Ignav provider")
        self._client = client
        self._key = api_key
        self._budget = budget
        self.market = market
        self._base = base_url.rstrip("/")
        self._timeout = timeout_s
        self._retries = max_retries
        self._gap = min_interval_s
        self._slots = asyncio.Semaphore(max_concurrent)
        self._pace = asyncio.Lock()
        self._last_start: float | None = None
        self._sleep = sleep
        self._clock = clock
        self.last_budget: BudgetStatus | None = None

    def __repr__(self) -> str:  # never show the key
        return f"IgnavProvider(market={self.market!r})"

    async def search(self, query: FareQuery) -> list[Offer]:
        p = query.passengers
        body: dict[str, Any] = {
            "origin": query.origin,
            "destination": query.destination,
            "departure_date": query.departure_date.isoformat(),
            "adults": p.adults,
            "children": p.children,
            "infants_in_seat": p.infants_in_seat,
            "infants_on_lap": p.infants_on_lap,
            "cabin_class": query.cabin,
            "market": self.market,
        }
        path = "/fares/one-way"
        if query.return_date is not None:
            body["return_date"] = query.return_date.isoformat()
            path = "/fares/round-trip"
        route = f"{query.origin}-{query.destination}"
        data = await self._post(path, body, what=f"search {route}")
        offers = normalise(data, query)
        logger.info("ignav search %s %s: %d offers", route, query.departure_date, len(offers))
        return offers

    async def booking_links(self, reference: str) -> list[BookingLink]:
        data = await self._post("/fares/booking-links", {"ignav_id": reference}, what="links")
        return _links(data)

    # ---- transport ----------------------------------------------------------------------

    async def _wait_turn(self) -> None:
        async with self._pace:
            if self._last_start is not None:
                wait = self._gap - (self._clock() - self._last_start)
                if wait > 0:
                    await self._sleep(wait)
            self._last_start = self._clock()

    async def _post(self, path: str, body: dict[str, Any], *, what: str) -> dict[str, Any]:
        attempt = 0
        while True:
            # Raises BudgetExceededError / BudgetUnavailableError: nothing is sent then.
            self.last_budget = await self._budget.reserve(self.name)
            try:
                async with self._slots:
                    await self._wait_turn()
                    response = await self._client.post(
                        f"{self._base}{path}",
                        json=body,
                        headers={"X-Api-Key": self._key, "Accept": "application/json"},
                        timeout=self._timeout,
                    )
                error = None if response.status_code == 200 else self._error(response)
            except httpx.TimeoutException:
                error = ProviderError(
                    self.name, _MESSAGES["server_busy"], code="timeout", retryable=True
                )
            except httpx.TransportError as exc:
                error = ProviderError(
                    self.name, _DEFAULT_MESSAGE, code=type(exc).__name__, retryable=True
                )
            else:
                if error is None:
                    try:
                        payload = response.json()
                    except ValueError:
                        payload = None
                    if isinstance(payload, dict):
                        return payload
                    error = ProviderError(self.name, _DEFAULT_MESSAGE, code="bad_json")

            if not error.retryable or attempt >= self._retries:
                logger.warning("ignav %s failed: %s", what, error)
                raise error
            attempt += 1
            delay = (
                error.retry_after_s
                if error.retry_after_s is not None
                else min(2.0 ** (attempt - 1), 4.0)
            )
            logger.info("ignav %s: %s, retry %d in %.1fs", what, error.code, attempt, delay)
            await self._sleep(delay)

    def _error(self, response: httpx.Response) -> ProviderError:
        status = response.status_code
        code = f"http_{status}"
        try:
            detail = response.json().get("error") or {}
            code = str(detail.get("code") or code)
        except (ValueError, AttributeError):
            pass
        if status in (401, 403):
            logger.error("ignav rejected the API key or account (%s)", code)
            return ProviderError(self.name, _AUTH_MESSAGE, code=code, status=status)
        if status == 404:
            return NotFoundError(
                self.name,
                _MESSAGES.get(code, _MESSAGES["ignav_id_not_found"]),
                code=code,
                status=status,
            )
        # Never retry a 4xx, except the one Ignav documents as transient (424).
        retryable = code in RETRYABLE_CODES or status >= 500
        retry_after: float | None = None
        if retryable:
            try:
                retry_after = min(
                    max(float(response.headers.get("retry-after", "")), 0.0), MAX_RETRY_AFTER_S
                )
            except ValueError:
                retry_after = None
        return ProviderError(
            self.name,
            _MESSAGES.get(code, _DEFAULT_MESSAGE),
            code=code,
            status=status,
            retryable=retryable,
            retry_after_s=retry_after,
        )
