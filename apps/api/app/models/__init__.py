"""ORM models. Import every model module here so Alembic autogenerate sees it."""

from app.database.base import Base
from app.models.airports import Airline, Airport, Terminal, TerminalAirline
from app.models.lounges import (
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
from app.models.observations import AirportSighting, OsmTerminal
from app.models.sources import RecordSource, Source, SourceCheck
from app.models.usage import ProviderUsage

__all__ = [
    "AccessProgram",
    "Airline",
    "Airport",
    "AirportSighting",
    "Amenity",
    "Bank",
    "Base",
    "CardNetwork",
    "CreditCard",
    "Lounge",
    "LoungeAccessMethod",
    "LoungeAmenity",
    "LoungePolicy",
    "OsmTerminal",
    "PolicyRule",
    "ProviderUsage",
    "RecordSource",
    "Source",
    "SourceCheck",
    "Terminal",
    "TerminalAirline",
]
