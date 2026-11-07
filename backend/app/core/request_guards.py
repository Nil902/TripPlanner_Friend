"""Bound request bodies and expensive work in the single-worker deployment."""

import time
from collections import deque
from collections.abc import Callable

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.security import decode_access_token


class RequestGuards:
    def __init__(
        self,
        app: ASGIApp,
        *,
        enabled: bool = True,
        production: bool = False,
        public_limit: int = 30,
        ai_limit: int = 5,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.app = app
        self.enabled = enabled
        self.production = production
        self.public_limit = public_limit
        self.ai_limit = ai_limit
        self.clock = clock
        self.windows: dict[str, deque[float]] = {}
        self.active_trips: set[str] = set()
        self.last_cleanup = 0.0

    def limited(self, key: str, limit: int) -> bool:
        now = self.clock()
        if now - self.last_cleanup >= 60:
            self.windows = {
                k: v for k, v in self.windows.items() if v and v[-1] > now - 60
            }
            self.last_cleanup = now
        if key not in self.windows and len(self.windows) >= 5000:
            return True
        window = self.windows.setdefault(key, deque())
        while window and window[0] <= now - 60:
            window.popleft()
        if len(window) >= limit:
            return True
        window.append(now)
        return False

    async def reject(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
        status: int,
        code: str,
        message: str,
    ) -> None:
        response = JSONResponse(
            {"detail": {"code": code, "message": message}},
            status_code=status,
            headers={"Retry-After": "60"} if status in {429, 503} else None,
        )
        await response(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path, method = scope["path"], scope["method"]
        parts = path.strip("/").split("/")
        is_ai = (
            method == "POST"
            and len(parts) >= 5
            and parts[:3] == ["api", "v1", "trips"]
            and (
                (parts[4] == "rebalance" and len(parts) == 5)
                or (
                    parts[4] == "plan"
                    and (
                        len(parts) == 5
                        or (len(parts) == 6 and parts[5] in {"ask", "refine"})
                    )
                )
            )
        )
        is_public = method == "POST" and (
            path in {"/api/v1/auth/login", "/api/v1/auth/signup", "/api/v1/admin/login"}
            or (
                len(parts) == 5
                and parts[:3] == ["api", "v1", "trips"]
                and parts[4] == "join"
            )
        )
        headers = Headers(scope=scope)
        trip_key = None
        if self.enabled and (is_ai or is_public):
            peer = (scope.get("client") or ("unknown", 0))[0]
            subject = None
            authorization = headers.get("authorization", "")
            if authorization.lower().startswith("bearer "):
                subject = decode_access_token(authorization[7:])
            key = f"ai:{subject or peer}" if is_ai else f"public:{peer}"
            if self.limited(key, self.ai_limit if is_ai else self.public_limit):
                await self.reject(
                    scope,
                    receive,
                    send,
                    429,
                    "RATE_LIMITED",
                    "Too many requests. Please try again in a minute.",
                )
                return
            if is_ai and subject is not None:
                trip_key = parts[3]
                if trip_key in self.active_trips:
                    await self.reject(
                        scope,
                        receive,
                        send,
                        409,
                        "PLANNING_IN_PROGRESS",
                        "A planning request is already running for this trip.",
                    )
                    return
                if len(self.active_trips) >= 4:
                    await self.reject(
                        scope,
                        receive,
                        send,
                        503,
                        "PLANNER_BUSY",
                        "The planner is busy. Please try again shortly.",
                    )
                    return

        if method in {"POST", "PUT", "PATCH"}:
            try:
                length = int(headers.get("content-length", "0"))
            except ValueError:
                length = -1
            if length < 0 or length > 65536:
                await self.reject(
                    scope,
                    receive,
                    send,
                    413,
                    "PAYLOAD_TOO_LARGE",
                    "Please send a smaller request.",
                )
                return
            chunks: list[bytes] = []
            size = 0
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > 65536:
                    await self.reject(
                        scope,
                        receive,
                        send,
                        413,
                        "PAYLOAD_TOO_LARGE",
                        "Please send a smaller request.",
                    )
                    return
                chunks.append(chunk)
                if not message.get("more_body", False):
                    break
            body = b"".join(chunks)
            original_receive = receive
            delivered = False

            async def replay() -> Message:
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": body, "more_body": False}
                return await original_receive()

            receive = replay

        async def secure_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                response_headers["X-Content-Type-Options"] = "nosniff"
                response_headers["X-Frame-Options"] = "DENY"
                response_headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
                if path.startswith("/api/"):
                    response_headers["Cache-Control"] = "no-store"
                if self.production:
                    response_headers["Strict-Transport-Security"] = "max-age=31536000"
            await send(message)

        if trip_key is not None:
            # Body receipt can yield to another request, so acquire only after
            # reading it and recheck immediately before dispatching the handler.
            if trip_key in self.active_trips:
                await self.reject(
                    scope,
                    receive,
                    send,
                    409,
                    "PLANNING_IN_PROGRESS",
                    "A planning request is already running for this trip.",
                )
                return
            if len(self.active_trips) >= 4:
                await self.reject(
                    scope,
                    receive,
                    send,
                    503,
                    "PLANNER_BUSY",
                    "The planner is busy. Please try again shortly.",
                )
                return
            self.active_trips.add(trip_key)
        try:
            await self.app(scope, receive, secure_send)
        finally:
            if trip_key is not None:
                self.active_trips.discard(trip_key)
