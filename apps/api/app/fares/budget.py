"""Upstream request budget (ADR-0015).

Ignav gives 1,000 free requests once, then bills. Every outgoing request (retries included)
first reserves one unit here; when a cap is reached nothing is sent. The Postgres ledger checks
and increments in one transaction under an advisory lock, so the cap holds across restarts and
concurrent requests. If the counter can't be reached, no request is sent (fail closed).

Caps: a lifetime total (the free allowance is one-time), an optional calendar-month cap for
when billing is on, and an optional daily cap that stops one busy day draining the rest.
Days and months are IST.
"""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Protocol

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.india import today_ist
from app.providers.fares.base import BudgetExceededError, BudgetUnavailableError
from app.schemas.fares import BudgetStatus

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Usage:
    total: int
    month: int
    today: int


class UsageLedger(Protocol):
    async def usage(self, provider: str, today: date) -> Usage: ...

    async def reserve(
        self, provider: str, today: date, refuse: Callable[[Usage], str | None]
    ) -> Usage:
        """Atomically: read usage, raise BudgetExceededError if `refuse` returns a reason,
        else add one request for `today`. Returns usage including the new request."""
        ...


@dataclass(frozen=True, slots=True)
class BudgetPolicy:
    total_cap: int
    monthly_cap: int | None = None
    daily_cap: int | None = None
    warn_ratio: float = 0.95

    def refusal(self, u: Usage) -> str | None:
        if u.total >= self.total_cap:
            return (
                f"Fare search has used its allowance of {self.total_cap:,} searches, so it's "
                "paused to avoid charges. It resumes when the site owner raises the limit."
            )
        if self.monthly_cap is not None and u.month >= self.monthly_cap:
            return (
                f"Fare search has reached this month's limit of {self.monthly_cap:,} searches. "
                "It resumes next month."
            )
        if self.daily_cap is not None and u.today >= self.daily_cap:
            return (
                f"Fare search has reached today's limit of {self.daily_cap:,} searches. "
                "It resumes tomorrow (IST)."
            )
        return None

    def status(self, provider: str, u: Usage) -> BudgetStatus:
        cap, used = self.total_cap, u.total
        if self.monthly_cap is not None and self.monthly_cap - u.month < cap - used:
            cap, used = self.monthly_cap, u.month  # show whichever limit is closer
        near = used >= self.warn_ratio * cap
        message = None
        if used >= cap:
            message = self.refusal(u)
        elif near:
            message = (
                f"Heads up: {used:,} of {cap:,} fare searches used. Fare search pauses at "
                f"{cap:,} to avoid charges."
            )
        return BudgetStatus(
            provider=provider,
            used=used,
            cap=cap,
            today=u.today,
            daily_cap=self.daily_cap,
            near_limit=near,
            message=message,
        )


class BudgetGuard:
    def __init__(
        self,
        ledger: UsageLedger,
        policy: BudgetPolicy,
        today: Callable[[], date] = today_ist,
    ) -> None:
        self._ledger = ledger
        self.policy = policy
        self._today = today
        self._warned = False

    async def reserve(self, provider: str) -> BudgetStatus:
        """Reserve one upstream request, or raise. Call before every request (retries too)."""
        usage = await self._ledger.reserve(provider, self._today(), self.policy.refusal)
        status = self.policy.status(provider, usage)
        if status.near_limit and not self._warned:
            self._warned = True  # once per process in the logs; the UI shows it every time
            logger.warning("%s request budget: %s of %s used", provider, status.used, status.cap)
        return status

    async def status(self, provider: str) -> BudgetStatus | None:
        """Current usage, or None if the counter can't be read (never blocks a response)."""
        try:
            usage = await self._ledger.usage(provider, self._today())
        except BudgetUnavailableError:
            return None
        return self.policy.status(provider, usage)


class InMemoryUsageLedger:
    """For tests and the demo provider. Resets on restart: never use it for a paid source."""

    def __init__(self) -> None:
        self.counts: dict[tuple[str, date], int] = {}
        self._lock = asyncio.Lock()

    async def usage(self, provider: str, today: date) -> Usage:
        mine = {d: n for (p, d), n in self.counts.items() if p == provider}
        return Usage(
            total=sum(mine.values()),
            month=sum(n for d, n in mine.items() if (d.year, d.month) == (today.year, today.month)),
            today=mine.get(today, 0),
        )

    async def reserve(
        self, provider: str, today: date, refuse: Callable[[Usage], str | None]
    ) -> Usage:
        async with self._lock:
            reason = refuse(await self.usage(provider, today))
            if reason:
                raise BudgetExceededError(provider, reason)
            self.counts[(provider, today)] = self.counts.get((provider, today), 0) + 1
            return await self.usage(provider, today)


_USAGE_SQL = text(
    """
    SELECT
      coalesce(sum(requests), 0) AS total,
      coalesce(sum(requests) FILTER (WHERE day >= :month_start), 0) AS month,
      coalesce(sum(requests) FILTER (WHERE day = :today), 0) AS today
    FROM provider_usage
    WHERE provider = :provider
    """
)
_LOCK_SQL = text("SELECT pg_advisory_xact_lock(hashtext('provider_usage:' || :provider))")
_ADD_SQL = text(
    """
    INSERT INTO provider_usage (provider, day, requests) VALUES (:provider, :today, 1)
    ON CONFLICT (provider, day)
    DO UPDATE SET requests = provider_usage.requests + 1, updated_at = now()
    """
)


class PostgresUsageLedger:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    @staticmethod
    def _params(provider: str, today: date) -> dict[str, object]:
        return {"provider": provider, "today": today, "month_start": today.replace(day=1)}

    async def usage(self, provider: str, today: date) -> Usage:
        try:
            async with self._engine.connect() as conn:
                row = (await conn.execute(_USAGE_SQL, self._params(provider, today))).one()
        except (SQLAlchemyError, OSError) as exc:
            logger.warning("request budget read failed: %s", type(exc).__name__)
            raise BudgetUnavailableError(provider) from exc
        return Usage(int(row.total), int(row.month), int(row.today))

    async def reserve(
        self, provider: str, today: date, refuse: Callable[[Usage], str | None]
    ) -> Usage:
        params = self._params(provider, today)
        try:
            async with self._engine.begin() as conn:
                await conn.execute(_LOCK_SQL, params)
                row = (await conn.execute(_USAGE_SQL, params)).one()
                usage = Usage(int(row.total), int(row.month), int(row.today))
                reason = refuse(usage)
                if reason:
                    raise BudgetExceededError(provider, reason)
                await conn.execute(_ADD_SQL, params)
        except (SQLAlchemyError, OSError) as exc:
            logger.warning("request budget update failed: %s", type(exc).__name__)
            raise BudgetUnavailableError(provider) from exc
        return Usage(usage.total + 1, usage.month + 1, usage.today + 1)
