"""Dedupe, filter and sort normalised offers (ADR-0015). Pure functions, no I/O."""

import hashlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from app.schemas.fares import AirlineOption, Leg, Offer, SortBy

# Fallback names for carriers that fly Indian domestic routes, used when a provider gives only
# the code. Providers' own names win.
AIRLINE_NAMES = {
    "6E": "IndiGo",
    "AI": "Air India",
    "IX": "Air India Express",
    "QP": "Akasa Air",
    "SG": "SpiceJet",
    "9I": "Alliance Air",
    "S5": "Star Air",
    "IC": "Fly91",
    "UK": "Vistara",
}


def flights_signature(offer: Offer) -> str:
    """Same flights on the same days, whatever the provider or price."""
    parts = []
    for leg in (offer.outbound, offer.inbound):
        if leg is None:
            continue
        for s in leg.segments:
            parts.append(f"{s.flight_number or s.carrier_code or '?'}@{s.departure_local}")
        parts.append("|")
    return ";".join(parts)


def offer_id(provider: str, offer_signature: str, cabin: str | None) -> str:
    digest = hashlib.sha256(f"{offer_signature}#{cabin or ''}".encode()).hexdigest()[:16]
    return f"{provider}-{digest}"


def dedupe(offers: Iterable[Offer]) -> list[Offer]:
    """One offer per set of flights and cabin: the cheapest (verified price first on a tie)."""
    best: dict[tuple[str, str | None, str], Offer] = {}
    for o in offers:
        key = (flights_signature(o), o.cabin, o.currency)
        kept = best.get(key)
        if kept is None or (o.price, not o.price_verified) < (kept.price, not kept.price_verified):
            best[key] = o
    return list(best.values())


@dataclass(frozen=True, slots=True)
class Filters:
    max_stops: int | None = None
    airlines: frozenset[str] = frozenset()
    depart_after_hour: int | None = None
    depart_before_hour: int | None = None
    max_price: int | None = None


def _hour(local: str) -> int | None:
    """Hour of an ISO local time like 2026-12-01T06:45:00."""
    try:
        return int(local[11:13])
    except (ValueError, IndexError):
        return None


def _carriers(offer: Offer) -> set[str]:
    legs = [offer.outbound] + ([offer.inbound] if offer.inbound else [])
    return {c for leg in legs for c in leg.carriers}


def matches(offer: Offer, f: Filters) -> bool:
    if f.max_stops is not None and offer.stops > f.max_stops:
        return False
    if f.max_price is not None and offer.price > f.max_price:
        return False
    if f.airlines:
        carriers = _carriers(offer)
        # Every airline in the itinerary must be one the traveller picked.
        if not carriers or not carriers <= f.airlines:
            return False
    hour = _hour(offer.outbound.departure_local)
    if f.depart_after_hour is not None and (hour is None or hour < f.depart_after_hour):
        return False
    return not (f.depart_before_hour is not None and (hour is None or hour >= f.depart_before_hour))


INDIA_TZ = "Asia/Kolkata"


def connects_abroad(offer: Offer, indian_airports: frozenset[str] | None) -> bool:
    """True when any flight touches an airport outside India (for example a connection via
    Colombo on a Bengaluru-Hyderabad search): not a domestic trip, and it needs a passport.
    Uses the list of Indian airports when given, else the airport time zones."""
    for leg in (offer.outbound, offer.inbound):
        for s in leg.segments if leg else []:
            for code, tz in ((s.origin, s.departure_timezone), (s.destination, s.arrival_timezone)):
                if indian_airports is not None:
                    if code not in indian_airports:
                        return True
                elif tz is not None and tz != INDIA_TZ:
                    return True
    return False


def apply_filters(offers: Iterable[Offer], f: Filters) -> list[Offer]:
    return [o for o in offers if matches(o, f)]


@dataclass(frozen=True, slots=True)
class Weights:
    """For the "best" sort. Each factor is scaled to 0..1 within the result set."""

    price: float = 0.6
    duration: float = 0.3
    stops: float = 0.1

    @classmethod
    def parse(cls, raw: str) -> "Weights":
        """ "0.6,0.3,0.1" -> Weights. Raises ValueError on anything else."""
        parts = [float(p) for p in raw.split(",")]
        if len(parts) != 3 or any(p < 0 for p in parts) or sum(parts) == 0:
            raise ValueError("weights are three non-negative numbers: price,duration,stops")
        total = sum(parts)
        return cls(*(p / total for p in parts))


def _scale(value: float, low: float, high: float) -> float:
    return 0.0 if high == low else (value - low) / (high - low)


def best_scores(offers: Sequence[Offer], w: Weights) -> dict[str, float]:
    """Lower is better."""
    if not offers:
        return {}
    prices = [o.price for o in offers]
    durations = [o.total_duration_minutes for o in offers]
    lo_p, hi_p, lo_d, hi_d = min(prices), max(prices), min(durations), max(durations)
    return {
        o.id: w.price * _scale(o.price, lo_p, hi_p)
        + w.duration * _scale(o.total_duration_minutes, lo_d, hi_d)
        + w.stops * min(o.stops, 2) / 2
        for o in offers
    }


def sort_offers(offers: Sequence[Offer], by: SortBy, w: Weights) -> list[Offer]:
    if by == "cheapest":
        return sorted(offers, key=lambda o: (o.price, o.total_duration_minutes, o.id))
    if by == "fastest":
        return sorted(offers, key=lambda o: (o.total_duration_minutes, o.price, o.id))
    scores = best_scores(offers, w)
    return sorted(offers, key=lambda o: (scores[o.id], o.price, o.id))


def airline_options(offers: Iterable[Offer]) -> list[AirlineOption]:
    counts: dict[str, int] = {}
    names: dict[str, str] = {}
    for o in offers:
        for leg in (o.outbound, o.inbound):
            if leg is None:
                continue
            for s in leg.segments:
                if s.carrier_code and s.carrier_name and s.carrier_code not in names:
                    names[s.carrier_code] = s.carrier_name
        for code in _carriers(o):
            counts[code] = counts.get(code, 0) + 1
    return sorted(
        (
            AirlineOption(code=c, name=names.get(c) or AIRLINE_NAMES.get(c, c), offers=n)
            for c, n in counts.items()
        ),
        key=lambda a: (-a.offers, a.name),
    )


def leg_stops(leg: Leg) -> int:
    return max(len(leg.segments) - 1, 0)
