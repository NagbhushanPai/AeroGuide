"""On-demand live snapshot (ADR-0012).

- Upstream is fetched only when a request arrives and the snapshot is older than `ttl_s`;
  an existing snapshot is served while the refresh runs in the background.
- A single lock makes concurrent requests share one upstream sweep.
- Providers are tried in order; the demo provider is only ever used if configured alone.
- The snapshot is written to Redis at most every `warm_write_interval_s` so a restarted
  instance can serve immediately (marked with its real age).
- Reported routes are looked up a few at a time in the background and cached.
- Each provider gets at most `provider_timeout_s`, so one that hangs can't hold up the next,
  and a request with no snapshot at all waits at most `first_wait_s` before it is answered
  (as unavailable) while the sweep carries on in the background.
- `status()` reports the last sweep per provider for the health endpoint.
"""

import asyncio
import contextlib
import json
import logging
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from pydantic import TypeAdapter

from app.providers.flight_info.adsbdb import RouteLookupError
from app.providers.positions.base import PositionProvider, ProviderRateLimitedError
from app.schemas.positions import AircraftState, ReportedRoute

logger = logging.getLogger(__name__)

SNAPSHOT_KEY = "positions:snapshot"
SNAPSHOT_REDIS_TTL_S = 300
ROUTE_TTL_S = 6 * 3600

_aircraft_list = TypeAdapter(list[AircraftState])
_route_or_none = TypeAdapter(ReportedRoute | None)


class RouteLookup(Protocol):
    async def route_for_callsign(self, callsign: str) -> ReportedRoute | None: ...


class KeyValueStore(Protocol):
    """The subset of redis.asyncio.Redis used here (keeps tests free of a real Redis)."""

    async def get(self, name: str) -> str | None: ...
    async def set(self, name: str, value: str, ex: int | None = None) -> object: ...


@dataclass(frozen=True, slots=True)
class SourceInfo:
    name: str
    url: str
    attribution: str
    is_demo: bool


@dataclass(slots=True)
class ProviderStatus:
    ok: bool
    at: datetime
    error: str | None = None
    aircraft: int | None = None


@dataclass(slots=True)
class Snapshot:
    aircraft: list[AircraftState]
    source: SourceInfo
    fetched_at: datetime
    by_icao: dict[str, AircraftState] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.by_icao = {a.icao24: a for a in self.aircraft}


class LiveService:
    def __init__(
        self,
        providers: Sequence[PositionProvider],
        routes: RouteLookup | None,
        store: KeyValueStore | None,
        *,
        ttl_s: float = 60.0,
        warm_write_interval_s: float = 60.0,
        route_lookups_per_refresh: int = 10,
        provider_timeout_s: float = 45.0,
        first_wait_s: float = 10.0,
        monotonic: Callable[[], float] = time.monotonic,
        on_snapshot: "Callable[[Snapshot, LiveService], Awaitable[None]] | None" = None,
    ) -> None:
        if not providers:
            raise ValueError("at least one position provider is required")
        self._providers = list(providers)
        self._routes = routes
        self._store = store
        self._ttl = ttl_s
        self._warm_interval = warm_write_interval_s
        self._route_budget = route_lookups_per_refresh
        self._provider_timeout = provider_timeout_s
        self._first_wait = first_wait_s
        self._monotonic = monotonic
        self.providers: dict[str, ProviderStatus] = {}
        # Called in the background after each fresh upstream sweep (for example, airport
        # sightings). Its failures are logged and never affect the live snapshot.
        self._on_snapshot = on_snapshot
        self._observer_task: asyncio.Task[None] | None = None

        self._snapshot: Snapshot | None = None
        self._last_attempt: float | None = None
        self._last_warm_write: float | None = None
        self.last_error: str | None = None
        self._lock = asyncio.Lock()

        self._route_cache: dict[str, tuple[float, ReportedRoute | None]] = {}
        self._enrich_task: asyncio.Task[None] | None = None
        self._refresh_task: asyncio.Task[None] | None = None
        self._cooldown_until: dict[str, float] = {}

    # ---- snapshot ---------------------------------------------------------------------

    async def snapshot(self) -> Snapshot | None:
        """Current snapshot, refreshing when due.

        Stale-while-revalidate: if any snapshot exists, it's returned at once and the refresh
        runs in the background (one at a time). Only a request with no snapshot at all waits.
        Callers judge freshness from `fetched_at`, so a stale answer is never passed off as live.
        """
        if not self._is_due():
            return self._snapshot
        if self._refresh_task is None or self._refresh_task.done():
            self._refresh_task = asyncio.create_task(self._locked_refresh())
        if self._snapshot is None:
            # Nothing to serve yet: wait a little for the first sweep, but never so long that
            # the hosting proxy times the request out. The sweep continues either way.
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(asyncio.shield(self._refresh_task), self._first_wait)
        return self._snapshot

    async def _locked_refresh(self) -> None:
        async with self._lock:
            if self._is_due():
                await self._refresh()

    def _is_due(self) -> bool:
        return self._last_attempt is None or self._monotonic() - self._last_attempt >= self._ttl

    async def _refresh(self) -> None:
        self._last_attempt = self._monotonic()
        errors = []
        for provider in self._providers:
            if self._cooldown_until.get(provider.name, 0.0) > self._monotonic():
                errors.append(f"{provider.name}: resting after rate limit")
                continue
            try:
                aircraft = await asyncio.wait_for(provider.fetch(), self._provider_timeout)
            except ProviderRateLimitedError as exc:
                self._cooldown_until[provider.name] = self._monotonic() + exc.retry_after_s
                errors.append(f"{provider.name}: rate-limited")
                self._mark(provider.name, "rate-limited")
                logger.warning("%s", exc)
                continue
            except TimeoutError:
                errors.append(f"{provider.name}: timed out")
                self._mark(provider.name, f"timed out after {self._provider_timeout:g}s")
                logger.warning("position provider %s timed out", provider.name)
                continue
            except Exception as exc:  # any provider failure → try the next one
                errors.append(f"{provider.name}: {type(exc).__name__}")
                self._mark(provider.name, type(exc).__name__)
                logger.warning(
                    "position provider %s failed: %s: %s", provider.name, type(exc).__name__, exc
                )
                continue
            self._mark(provider.name, None, len(aircraft))
            self._snapshot = Snapshot(
                aircraft=aircraft,
                source=SourceInfo(
                    provider.name, provider.url, provider.attribution, provider.is_demo
                ),
                fetched_at=datetime.now(UTC),
            )
            self.last_error = "; ".join(errors) or None
            await self._maybe_write_warm()
            self._start_enrichment()
            self._notify(self._snapshot)
            return
        self.last_error = "; ".join(errors)

    def _mark(self, name: str, error: str | None, aircraft: int | None = None) -> None:
        self.providers[name] = ProviderStatus(
            ok=error is None, at=datetime.now(UTC), error=error, aircraft=aircraft
        )

    def status(self) -> dict[str, object]:
        """What the last sweeps did, for /health. In memory, so per process."""
        snap = self._snapshot
        now = self._monotonic()
        return {
            "source": snap.source.name if snap else None,
            "fetched_at": snap.fetched_at if snap else None,
            "aircraft": len(snap.aircraft) if snap else None,
            "last_error": self.last_error,
            "providers": {
                p.name: {
                    "ok": st.ok if (st := self.providers.get(p.name)) else None,
                    "checked_at": st.at if st else None,
                    "error": st.error if st else None,
                    "aircraft": st.aircraft if st else None,
                    "resting_s": max(0, round(self._cooldown_until.get(p.name, 0.0) - now)),
                }
                for p in self._providers
            },
        }

    async def warm_start(self) -> None:
        """Load the last snapshot saved by a previous instance (it keeps its real age)."""
        if self._store is None:
            return
        try:
            raw = await self._store.get(SNAPSHOT_KEY)
            if not raw:
                return
            data = json.loads(raw)
            self._snapshot = Snapshot(
                aircraft=_aircraft_list.validate_python(data["aircraft"]),
                source=SourceInfo(**data["source"]),
                fetched_at=datetime.fromisoformat(data["fetched_at"]),
            )
        except Exception as exc:  # a bad cache entry must never stop the app starting
            logger.warning("warm start skipped: %s", exc)

    async def _maybe_write_warm(self) -> None:
        if self._store is None or self._snapshot is None:
            return
        now = self._monotonic()
        if self._last_warm_write is not None and now - self._last_warm_write < self._warm_interval:
            return
        self._last_warm_write = now
        snap = self._snapshot
        payload = {
            "aircraft": _aircraft_list.dump_python(snap.aircraft, mode="json"),
            "source": {
                "name": snap.source.name,
                "url": snap.source.url,
                "attribution": snap.source.attribution,
                "is_demo": snap.source.is_demo,
            },
            "fetched_at": snap.fetched_at.isoformat(),
        }
        try:
            await self._store.set(SNAPSHOT_KEY, json.dumps(payload), ex=SNAPSHOT_REDIS_TTL_S)
        except Exception as exc:
            logger.warning("warm snapshot write failed: %s", exc)

    # ---- routes -----------------------------------------------------------------------

    def cached_route(self, callsign: str | None) -> ReportedRoute | None:
        if not callsign:
            return None
        hit = self._route_cache.get(callsign)
        if hit is None or hit[0] < self._monotonic():
            return None
        return hit[1]

    def _route_known(self, callsign: str) -> bool:
        hit = self._route_cache.get(callsign)
        return hit is not None and hit[0] >= self._monotonic()

    async def route(self, callsign: str | None) -> ReportedRoute | None:
        """Route for one callsign, looking it up now if it isn't cached."""
        if not callsign or self._routes is None:
            return None
        if self._route_known(callsign):
            return self.cached_route(callsign)
        return await self._lookup(callsign)

    async def _lookup(self, callsign: str) -> ReportedRoute | None:
        key = f"route:{callsign}"
        if self._store is not None:
            try:
                raw = await self._store.get(key)
                if raw is not None:
                    route = _route_or_none.validate_json(raw)
                    self._route_cache[callsign] = (self._monotonic() + ROUTE_TTL_S, route)
                    return route
            except Exception as exc:
                logger.warning("route cache read failed: %s", exc)
        if self._routes is None:
            return None
        try:
            route = await self._routes.route_for_callsign(callsign)
        except RouteLookupError as exc:
            logger.info("route lookup for %s failed: %s", callsign, exc)
            return None  # transient: not cached, retried later
        self._route_cache[callsign] = (self._monotonic() + ROUTE_TTL_S, route)
        if self._store is not None:
            try:
                await self._store.set(key, _route_or_none.dump_json(route).decode(), ex=ROUTE_TTL_S)
            except Exception as exc:
                logger.warning("route cache write failed: %s", exc)
        return route

    def _start_enrichment(self) -> None:
        if self._routes is None or self._snapshot is None or self._snapshot.source.is_demo:
            return
        if self._enrich_task is not None and not self._enrich_task.done():
            return
        pending = [
            a.callsign
            for a in self._snapshot.aircraft
            if a.callsign and not a.on_ground and not self._route_known(a.callsign)
        ][: self._route_budget]
        if pending:
            self._enrich_task = asyncio.create_task(self._enrich(pending))

    async def _enrich(self, callsigns: list[str]) -> None:
        sem = asyncio.Semaphore(3)  # polite to the community service

        async def one(cs: str) -> None:
            async with sem:
                await self._lookup(cs)

        await asyncio.gather(*(one(cs) for cs in callsigns), return_exceptions=True)

    def _notify(self, snapshot: Snapshot) -> None:
        if self._on_snapshot is None or snapshot.source.is_demo:
            return
        if self._observer_task is not None and not self._observer_task.done():
            return  # still handling the previous sweep; skip rather than queue up
        self._observer_task = asyncio.create_task(self._observe(snapshot))

    async def _observe(self, snapshot: Snapshot) -> None:
        if self._on_snapshot is None:
            return
        try:
            await self._on_snapshot(snapshot, self)
        except Exception as exc:
            logger.warning("snapshot observer failed: %s: %s", type(exc).__name__, exc)

    async def aclose(self) -> None:
        tasks = [
            t for t in (self._refresh_task, self._enrich_task, self._observer_task) if t is not None
        ]
        for task in tasks:
            task.cancel()
        # Let cancelled tasks finish unwinding before the caller closes clients they use.
        await asyncio.gather(*tasks, return_exceptions=True)
