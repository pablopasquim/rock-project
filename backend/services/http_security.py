"""Bound request memory before JSON parsing; log metadata, never request bodies."""
import json
import logging
import time
import uuid
from starlette.responses import JSONResponse

logger = logging.getLogger("finance.http")


class RequestSafetyMiddleware:
    def __init__(self, app, max_bytes=262144):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request_id = uuid.uuid4().hex
        start = time.monotonic()
        status = 500
        body = bytearray()
        if scope["method"] in {"POST", "PUT", "PATCH"}:
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > self.max_bytes:
                    response = JSONResponse({"detail": "Requisição muito grande."}, status_code=413,
                                            headers={"Cache-Control": "no-store"})
                    return await response(scope, receive, send)
                if not message.get("more_body", False):
                    break
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered and scope["method"] in {"POST", "PUT", "PATCH"}:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        async def tagged_send(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = list(message.get("headers", [])) + [(b"x-request-id", request_id.encode())]
            await send(message)

        try:
            await self.app(scope, bounded_receive, tagged_send)
        finally:
            route = scope.get("route")
            logger.info(json.dumps({"event": "http_request", "request_id": request_id,
                                   "route": getattr(route, "path", "unmatched"), "status": status,
                                   "duration_ms": round((time.monotonic() - start) * 1000)}))
