"""Fare provider interface (ADR-0015). A provider turns a FareQuery into normalised offers.

Adding a source means one adapter that implements FlightProvider and one entry in the
registry; the search service, cache, ranking and API don't change.
"""

from typing import Protocol

from app.schemas.fares import BookingLink, FareQuery, Offer


class FlightProvider(Protocol):
    name: str
    is_demo: bool

    async def search(self, query: FareQuery) -> list[Offer]:
        """Offers for one origin-destination pair. Raises ProviderError on failure (never
        returns an empty list to hide one)."""
        ...

    async def booking_links(self, reference: str) -> list[BookingLink]:
        """Where to book the offer whose BookingRef.reference is given."""
        ...


class ProviderError(Exception):
    """A provider couldn't answer. `message` is safe to show to users; `code` is for logs."""

    def __init__(
        self,
        provider: str,
        message: str,
        *,
        code: str = "error",
        status: int | None = None,
        retryable: bool = False,
        retry_after_s: float | None = None,
    ) -> None:
        super().__init__(f"{provider}: {code}" + (f" (HTTP {status})" if status else ""))
        self.provider = provider
        self.message = message
        self.code = code
        self.status = status
        self.retryable = retryable
        self.retry_after_s = retry_after_s  # the source's Retry-After, when it sent one


class NotFoundError(ProviderError):
    """The provider doesn't know the reference (for example an expired itinerary id)."""


class BudgetExceededError(ProviderError):
    """Our own request cap is reached: no request was sent."""

    def __init__(self, provider: str, message: str) -> None:
        super().__init__(provider, message, code="budget_exceeded")


class BudgetUnavailableError(ProviderError):
    """The request counter couldn't be checked, so no request was sent (fail closed)."""

    def __init__(self, provider: str) -> None:
        super().__init__(
            provider,
            "Fare search is paused because the search allowance couldn't be checked. "
            "Try again in a moment.",
            code="budget_unavailable",
        )
