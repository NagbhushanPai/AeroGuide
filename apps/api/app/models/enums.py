"""Postgres enums shared by several tables. Values are the stored strings."""

from enum import StrEnum

from sqlalchemy import Enum as SAEnum


class VerificationStatus(StrEnum):
    VERIFIED = "verified"
    UNVERIFIED = "unverified"
    UNAVAILABLE = "unavailable"


class SourceType(StrEnum):
    OFFICIAL_AIRPORT = "official_airport"
    AAI = "aai"
    AIRLINE = "airline"
    BANK = "bank"
    LOUNGE_OPERATOR = "lounge_operator"
    NETWORK_PROGRAM = "network_program"
    LICENSED_PROVIDER = "licensed_provider"
    SECONDARY = "secondary"


# A `verified` record must cite one of these (ADR-0006). Secondary sources only lead to one.
PRIMARY_SOURCE_TYPES = frozenset(SourceType) - {SourceType.SECONDARY}


class TerminalRole(StrEnum):
    DOMESTIC = "domestic"
    INTERNATIONAL = "international"
    MIXED = "mixed"


class AirlineOperation(StrEnum):
    DOMESTIC = "domestic"
    INTERNATIONAL = "international"
    BOTH = "both"


def pg_enum(enum: type[StrEnum], name: str) -> SAEnum:
    """Store the enum's values (not member names). Types are created by migrations."""
    return SAEnum(
        enum,
        name=name,
        values_callable=lambda e: [m.value for m in e],
        create_type=False,
        validate_strings=True,
    )


verification_status_enum = pg_enum(VerificationStatus, "verification_status")
source_type_enum = pg_enum(SourceType, "source_type")
terminal_role_enum = pg_enum(TerminalRole, "terminal_role")
airline_operation_enum = pg_enum(AirlineOperation, "airline_operation")
