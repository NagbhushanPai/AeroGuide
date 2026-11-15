"""A small per-client rate limit for the public API and MCP endpoint (ADR-0014).

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
    """The caller's address. Behind Render's proxy, the LAST X-Forwarded-For entry: the proxy
    appends the address it saw, while earlier entries come from the client and can be forged."""
    for name, value in scope.get("headers", []):
        if name == b"x-forwarded-for":
            parts = [p.strip() for p in bytes(value).decode("latin-1").split(",")]
            last = next((p for p in reversed(parts) if p), "")
            if last:
                return last
    client = scope.get("client")
    return str(client[0]) if client else "unknown"


class RateLimit:
    """Allows `per_minute` requests per client in any rolling 60-second window."""

    def __init__(
        self,
        app: ASGIApp,
        per_minute: int,
        clock: Callable[[], float] = time.monotonic,
        exempt: tuple[str, ...] = (),
        only: tuple[str, ...] = (),
    ) -> None:
        self.app = app
        self.per_minute = per_minute
        self.clock = clock
        self.exempt = exempt  # path prefixes that aren't counted (for example health checks)
        self.only = only  # if set, only these path prefixes are counted
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
        path = str(scope.get("path", ""))
        if (
            scope["type"] != "http"
            or (self.exempt and path.startswith(self.exempt))
            or (self.only and not path.startswith(self.only))
        ):
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


class BodyLimit:
    """Refuses request bodies larger than `max_bytes` (413) before they are parsed."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        for name, value in scope.get("headers", []):
            length = bytes(value)
            if name == b"content-length" and length.isdigit() and int(length) > self.max_bytes:
                await _too_large(send)
                return
        received = 0

        async def limited() -> dict[str, object]:
            nonlocal received
            message = dict(await receive())
            if message.get("type") == "http.request":
                received += len(message.get("body", b"") or b"")
                if received > self.max_bytes:
                    raise _BodyTooLargeError
            return message

        try:
            await self.app(scope, limited, send)
        except _BodyTooLargeError:
            await _too_large(send)


class _BodyTooLargeError(Exception):
    pass


async def _too_large(send: Send) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": b'{"error": "Request body too large."}'})
