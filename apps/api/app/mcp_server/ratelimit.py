"""A small per-client rate limit for the public MCP endpoint (ADR-0014).

In memory, so it is per process. That fits one free-tier instance; it isn't a substitute for a
shared limiter if the API ever runs on several instances.
"""

import json
import time
from collections import deque
from collections.abc import Callable

from starlette.types import ASGIApp, Receive, Scope, Send

WINDOW_S = 60.0
MAX_TRACKED_CLIENTS = 10_000


def client_key(scope: Scope) -> str:
    """The caller's address. Behind Render's proxy, the first X-Forwarded-For entry."""
    for name, value in scope.get("headers", []):
        if name == b"x-forwarded-for":
            first: str = bytes(value).decode("latin-1").split(",")[0].strip()
            if first:
                return first
    client = scope.get("client")
    return str(client[0]) if client else "unknown"


class RateLimit:
    """Allows `per_minute` requests per client in any rolling 60-second window."""

    def __init__(
        self, app: ASGIApp, per_minute: int, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.app = app
        self.per_minute = per_minute
        self.clock = clock
        self.hits: dict[str, deque[float]] = {}

    def _allow(self, key: str) -> float | None:
        """None if allowed, else seconds until the next request would be."""
        now = self.clock()
        hits = self.hits.get(key)
        if hits is None:
            if len(self.hits) >= MAX_TRACKED_CLIENTS:
                self._prune(now)
            hits = self.hits[key] = deque()
        while hits and now - hits[0] >= WINDOW_S:
            hits.popleft()
        if len(hits) >= self.per_minute:
            return WINDOW_S - (now - hits[0])
        hits.append(now)
        return None

    def _prune(self, now: float) -> None:
        stale = [k for k, h in self.hits.items() if not h or now - h[-1] >= WINDOW_S]
        for k in stale:
            del self.hits[k]
        if len(self.hits) >= MAX_TRACKED_CLIENTS:  # still full: forget the oldest
            oldest = min(self.hits, key=lambda k: self.hits[k][-1])
            del self.hits[oldest]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        wait = self._allow(client_key(scope))
        if wait is None:
            await self.app(scope, receive, send)
            return
        body = json.dumps(
            {"error": f"Too many requests. Try again in {max(1, round(wait))} seconds."}
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"retry-after", str(max(1, round(wait))).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
