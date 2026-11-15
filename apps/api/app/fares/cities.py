"""Indian cities served by more than one airport with scheduled service (ADR-0015).

Searching one airport never searches the others silently: each extra airport pair costs one
more upstream request, so the caller opts in with `nearby_airports`.
"""

from itertools import product

# Airport -> every airport serving the same city, the main one first. Only cities with more
# than one airport in apps/api/data/airports.yaml are listed. Single-airport cities (BLR, HYD,
# MAA, CCU, JAI, AMD, PNQ, ...) need no entry.
CITY_AIRPORTS: dict[str, tuple[str, ...]] = {}
for _group in (
    ("DEL", "DXN"),  # Delhi: Indira Gandhi International; Noida International (Jewar)
    ("BOM", "NMI"),  # Mumbai: Chhatrapati Shivaji Maharaj; Navi Mumbai
    ("GOI", "GOX"),  # Goa: Dabolim; Manohar International (Mopa)
):
    for _code in _group:
        CITY_AIRPORTS[_code] = _group

# A search may expand to at most this many airport pairs (2 x 2).
MAX_PAIRS = 4


def nearby(code: str) -> tuple[str, ...]:
    """The airport's city group, starting with `code` itself."""
    group = CITY_AIRPORTS.get(code, (code,))
    return (code, *(c for c in group if c != code))


def airport_pairs(origin: str, destination: str, include_nearby: bool) -> list[tuple[str, str]]:
    """Origin-destination pairs to search, the requested pair first."""
    if not include_nearby:
        return [(origin, destination)]
    pairs = [(o, d) for o, d in product(nearby(origin), nearby(destination)) if o != d]
    return pairs[:MAX_PAIRS]
