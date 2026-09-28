"""Basic per-IP rate limits (in memory, per server process).

- A global limit applies to every request (RATE_LIMIT_DEFAULT).
- Routes that need a stricter limit (e.g. login) add `Depends(rate_limit("5/minute"))`.
"""

from fastapi import HTTPException, Request
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import get_settings

_limiter = MovingWindowRateLimiter(MemoryStorage())


def _client_ip(request: Request) -> str:
    # uvicorn --proxy-headers sets request.client from X-Forwarded-For behind the host's proxy.
    return request.client.host if request.client else "unknown"


class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.limit = parse(get_settings().rate_limit_default)

    async def dispatch(self, request, call_next):
        if request.method != "OPTIONS" and not _limiter.hit(self.limit, "global", _client_ip(request)):
            return JSONResponse({"detail": "Too many requests. Please wait a moment."}, status_code=429)
        return await call_next(request)


def reset_limits() -> None:
    """Clear all counters (used by tests)."""
    _limiter.storage.reset()


def rate_limit(limit: str):
    """Route dependency for a stricter, per-route limit."""
    item = parse(limit)

    def check(request: Request) -> None:
        if not _limiter.hit(item, request.url.path, _client_ip(request)):
            raise HTTPException(status_code=429, detail="Too many attempts. Please wait a moment.")

    return check
