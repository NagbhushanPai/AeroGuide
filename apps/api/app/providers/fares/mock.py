"""Demo fare provider (ADR-0011, ADR-0015): generated offers for tests and offline demos.

NOT REAL FARES. Every offer is flagged `is_demo`, the website shows the DEMO label, and the
registry only allows this provider on its own (FARE_PROVIDERS=mock), never mixed with a real
source. Output is deterministic for a given query, so tests are stable.
"""

import hashlib
import math
import random
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlencode

from app.core.india import IST, IST_TIMEZONE
from app.fares.ranking import AIRLINE_NAMES, flights_signature, offer_id
from app.providers.fares.base import NotFoundError
from app.schemas.fares import BookingLink, BookingRef, FareQuery, Leg, Offer, Segment

NAME = "mock"
DEMO_BOOKING_URL = "https://example.org/aeroguide-demo-booking"

# Approximate airport positions, for plausible block times only.
_POSITIONS = {
    "DEL": (28.56, 77.10),
    "DXN": (28.19, 77.62),
    "BOM": (19.09, 72.87),
    "NMI": (18.99, 73.06),
    "BLR": (13.20, 77.71),
    "HYD": (17.24, 78.43),
    "MAA": (12.99, 80.17),
    "CCU": (22.65, 88.45),
    "GOI": (15.38, 73.83),
    "GOX": (15.73, 73.86),
    "JAI": (26.82, 75.81),
    "AMD": (23.07, 72.63),
    "PNQ": (18.58, 73.92),
    "COK": (10.15, 76.40),
    "GAU": (26.11, 91.59),
    "LKO": (26.76, 80.89),
    "TRV": (8.48, 76.92),
    "IXC": (30.67, 76.79),
    "SXR": (34.00, 74.77),
    "PAT": (25.59, 85.09),
}
_HUBS = ("DEL", "BOM", "BLR", "HYD")
# code, flight number range, price factor
_CARRIERS = (
    ("6E", (100, 6999), 1.00),
    ("AI", (400, 2999), 1.12),
    ("IX", (1000, 2999), 0.95),
    ("QP", (1100, 1899), 0.97),
    ("SG", (100, 999), 0.93),
)
_CABIN_FACTOR = {"economy": 1.0, "premium_economy": 1.7, "business": 3.4, "first": 5.0}


def _km(a: str, b: str) -> float:
    (la1, lo1), (la2, lo2) = _POSITIONS.get(a, (20.0, 78.0)), _POSITIONS.get(b, (22.0, 80.0))
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = p2 - p1, math.radians(lo2 - lo1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return max(2 * 6371 * math.asin(math.sqrt(h)), 250.0)


def _block_minutes(a: str, b: str) -> int:
    return int(round((35 + _km(a, b) / 12.5) / 5) * 5)  # taxi + climb, about 750 km/h cruise


def _seed(*parts: object) -> int:
    return int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:12], 16)


def _segment(code: str, number: int, a: str, b: str, start: datetime) -> Segment:
    minutes = _block_minutes(a, b)
    end = start + timedelta(minutes=minutes)
    return Segment(
        carrier_code=code,
        carrier_name=AIRLINE_NAMES[code],
        flight_number=f"{code}{number}",
        origin=a,
        destination=b,
        departure_local=start.strftime("%Y-%m-%dT%H:%M:%S"),
        departure_timezone=IST_TIMEZONE,
        departure_utc=start.astimezone(UTC),
        arrival_local=end.strftime("%Y-%m-%dT%H:%M:%S"),
        arrival_timezone=IST_TIMEZONE,
        arrival_utc=end.astimezone(UTC),
        duration_minutes=minutes,
        aircraft="A320neo" if code in ("6E", "AI", "IX") else "737 MAX 8",
    )


def _leg(segs: list[Segment]) -> Leg:
    first, last = segs[0], segs[-1]
    if first.departure_utc is None or last.arrival_utc is None:  # _segment always sets them
        raise ValueError("demo segment without UTC times")
    return Leg(
        origin=first.origin,
        destination=last.destination,
        departure_local=first.departure_local,
        departure_timezone=IST_TIMEZONE,
        arrival_local=last.arrival_local,
        arrival_timezone=IST_TIMEZONE,
        duration_minutes=int((last.arrival_utc - first.departure_utc).total_seconds() // 60),
        stops=len(segs) - 1,
        carriers=list(dict.fromkeys(s.carrier_code for s in segs if s.carrier_code)),
        carrier_names=list(dict.fromkeys(s.carrier_name for s in segs if s.carrier_name)),
        flight_numbers=[s.flight_number for s in segs if s.flight_number],
        segments=segs,
    )


def _legs_for(rng: random.Random, a: str, b: str, day: date, n: int) -> list[tuple[str, Leg]]:
    """n options from a to b on `day`: mostly nonstop, some one-stop via a hub."""
    out: list[tuple[str, Leg]] = []
    hubs = [h for h in _HUBS if h not in (a, b)]
    for i in range(n):
        code, (lo, hi), _ = _CARRIERS[i % len(_CARRIERS)]
        hour, minute = rng.randint(5, 22), rng.choice((0, 10, 20, 30, 40, 50))
        start = datetime(day.year, day.month, day.day, hour, minute, tzinfo=IST)
        if i % 4 == 3 and hubs:
            hub = rng.choice(hubs)
            first = _segment(code, rng.randint(lo, hi), a, hub, start)
            layover = timedelta(minutes=rng.choice((65, 90, 120, 150)))
            if first.arrival_utc is None:  # _segment always sets it
                raise ValueError("demo segment without UTC times")
            second = _segment(
                code, rng.randint(lo, hi), hub, b, first.arrival_utc.astimezone(IST) + layover
            )
            out.append((code, _leg([first, second])))
        else:
            out.append((code, _leg([_segment(code, rng.randint(lo, hi), a, b, start)])))
    return out


def _price(rng: random.Random, query: FareQuery, code: str, km: float, stops: int) -> float:
    factor = next(f for c, _, f in _CARRIERS if c == code)
    per_seat = (1800 + km * 3.6) * factor * rng.uniform(0.85, 1.55) * (0.9 if stops else 1.0)
    per_seat *= _CABIN_FACTOR[query.cabin]
    p = query.passengers
    seats = p.adults + p.children + p.infants_in_seat
    return float(round(per_seat * seats + 1500 * p.infants_on_lap))


class MockProvider:
    name = NAME
    is_demo = True

    def __init__(self, offers_per_search: int = 15) -> None:
        self._n = offers_per_search

    async def search(self, query: FareQuery) -> list[Offer]:
        rng = random.Random(_seed(query.model_dump_json()))  # noqa: S311 (demo data, not security)
        a, b = query.origin, query.destination
        outbound = _legs_for(rng, a, b, query.departure_date, self._n)
        inbound = _legs_for(rng, b, a, query.return_date, self._n) if query.return_date else None
        km = _km(a, b)
        now = datetime.now(UTC)
        offers = []
        for i, (code, out_leg) in enumerate(outbound):
            in_leg = inbound[i][1] if inbound else None
            price = _price(rng, query, code, km, out_leg.stops)
            if in_leg:
                price += _price(rng, query, code, km, in_leg.stops)
            offer = Offer(
                id="",
                provider=NAME,
                is_demo=True,
                price=price,
                currency="INR",
                price_verified=False,
                cabin=query.cabin,
                outbound=out_leg,
                inbound=in_leg,
                total_duration_minutes=out_leg.duration_minutes
                + (in_leg.duration_minutes if in_leg else 0),
                stops=max(out_leg.stops, in_leg.stops if in_leg else 0),
                mixed_carriers=False,
                fetched_at=now,
                booking=BookingRef(provider=NAME, reference=""),
            )
            oid = offer_id(NAME, flights_signature(offer), offer.cabin)
            offers.append(
                offer.model_copy(
                    update={"id": oid, "booking": BookingRef(provider=NAME, reference=oid)}
                )
            )
        return offers

    async def booking_links(self, reference: str) -> list[BookingLink]:
        if not reference.startswith(f"{NAME}-"):
            raise NotFoundError(NAME, "This demo fare doesn't exist.", code="not_found")
        return [
            BookingLink(
                seller="Demo seller (not a real booking site)",
                seller_type="demo",
                fare_name=None,
                price=None,
                currency=None,
                url=f"{DEMO_BOOKING_URL}?{urlencode({'offer': reference})}",
            )
        ]
