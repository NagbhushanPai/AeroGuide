"""ORM models. Import every model module here so Alembic autogenerate sees it."""

from app.database.base import Base
from app.models.airports import Airline, Airport, Terminal, TerminalAirline
from app.models.observations import AirportSighting, OsmTerminal
from app.models.sources import RecordSource, Source, SourceCheck

__all__ = [
    "Airline",
    "Airport",
    "AirportSighting",
    "Base",
    "OsmTerminal",
    "RecordSource",
    "Source",
    "SourceCheck",
    "Terminal",
    "TerminalAirline",
]
