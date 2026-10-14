"""FastAPI app for the Keplar Wants swarm service.

    POST /v1/orchestrate                    one turn (NDJSON stream). Called by keplar.one's /api/keplar/wants/orchestrate,
                                            which has already signed the person in; this service trusts only that caller
                                            (Bearer KEPLAR_WANTS_SWARM_TOKEN, compared in constant time).
    GET  /v1/jobs/{id}                      a background swarm job (status, recent events, result)
    GET  /v1/connectors                     every connector and its status (available / needs_credentials / placeholder)
    POST /v1/connectors/{id}/oauth/start    -> {"url"}: the provider sign-in URL (OAuth 2.0 + PKCE)
    GET  /v1/connectors/{id}/oauth/callback the provider redirects here; the token is stored for the user in `state`
    PUT  /v1/pin                            set the person's purchase PIN
    GET  /v1/diagnostics                    metrics snapshot (cache hit rate, step success rate, timings)
    GET  /healthz

Boundaries (all deterministic, all logged to swarm_diagnostics.log):
    * request bodies over MAX_BODY_BYTES, malformed JSON and schema violations -> 400 {"error", "code"}
    * more than RATE_PER_MIN calls per session per minute (token bucket)      -> 429 {"error", "code", "retry_after"}
    * every handler runs inside asyncio.wait_for(ROUTE_TIMEOUT_S = 15 s)       -> 504 JSON, or for the NDJSON stream a final
      fallback card, then the stream ends (the turn's generator is closed, which cancels its awaits)
    * any other exception                                                      -> 500 JSON; the process keeps serving
Note: a model-backed swarm step can take longer than 15 s; KEPLAR_WANTS_ROUTE_TIMEOUT raises the cap if needed.

Run:  uvicorn keplar_wants.orchestrator:app --host 0.0.0.0 --port 8080
"""
from __future__ import annotations

import asyncio
import hmac
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Awaitable, Optional, TypeVar

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from . import diagnostics as diag
from .connectors import OAuth2Connector
from .context import Context
from .engine import run_turn
from .models import OrchestrateRequest

_ctx: Optional[Context] = None

ROUTE_TIMEOUT_S = float(os.environ.get("KEPLAR_WANTS_ROUTE_TIMEOUT", "15"))
RATE_PER_MIN = int(os.environ.get("KEPLAR_WANTS_RATE_PER_MIN", "60"))
MAX_BODY_BYTES = int(os.environ.get("KEPLAR_WANTS_MAX_BODY", str(64 * 1024)))

T = TypeVar("T")


def _error(status: int, code: str, message: str, **extra: Any) -> JSONResponse:
    return JSONResponse({"error": message, "code": code, **extra}, status_code=status, headers={"cache-control": "no-store"})


async def bounded(aw: Awaitable[T], route: str) -> T:
    """Runs a handler's work under the hard route timeout. A timeout becomes HTTP 504 (and a diagnostics line)."""
    try:
        return await asyncio.wait_for(aw, ROUTE_TIMEOUT_S)
    except asyncio.TimeoutError:
        diag.log("route_timeout", route=route, timeout_s=ROUTE_TIMEOUT_S)
        raise HTTPException(504, f"That took longer than {ROUTE_TIMEOUT_S:.0f} seconds. Try again.")


class TokenBucket:
    """Fixed token bucket per key: `rate` calls per minute, refilled continuously. In-process (one replica); behind several
    replicas, swap the dict for a shared store (Redis INCR with expiry) with the same interface."""

    def __init__(self, rate_per_min: int, now=time.monotonic, max_keys: int = 50_000) -> None:
        self.cap, self.per_s, self.now, self.max_keys = float(rate_per_min), rate_per_min / 60.0, now, max_keys
        self.state: dict[str, tuple[float, float]] = {}

    def take(self, key: str) -> float:
        """0 when allowed, else seconds until the next call is allowed."""
        t = self.now()
        tokens, last = self.state.get(key, (self.cap, t))
        tokens = min(self.cap, tokens + (t - last) * self.per_s)
        if tokens < 1:
            self.state[key] = (tokens, t)
            return (1 - tokens) / self.per_s
        if len(self.state) >= self.max_keys and key not in self.state:
            self.state.pop(next(iter(self.state)))
        self.state[key] = (tokens - 1, t)
        return 0.0


BUCKET = TokenBucket(RATE_PER_MIN)


class BodyLimit:
    """Pure ASGI middleware: refuses request bodies over `limit` bytes with a 400, before any handler or parser runs
    (checks Content-Length up front and counts streamed chunks for bodies without one)."""

    def __init__(self, app: ASGIApp, limit: int) -> None:
        self.app, self.limit = app, limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        cl = headers.get(b"content-length")
        too_big = _error(400, "too_large", f"The request is larger than {self.limit} bytes.")
        if cl is not None:
            if not cl.isdigit() or int(cl) > self.limit:
                return await too_big(scope, receive, send)
        seen = 0

        async def limited() -> Message:
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > self.limit:
                    raise _TooLarge()
            return msg

        try:
            await self.app(scope, limited, send)
        except _TooLarge:
            await too_big(scope, receive, send)


class _TooLarge(Exception):
    pass


def get_ctx() -> Context:
    if _ctx is None:
        raise HTTPException(503, "Starting up.")
    return _ctx


def set_ctx(ctx: Optional[Context]) -> None:
    """Tests inject their own context."""
    global _ctx
    _ctx = ctx


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    diag.configure()
    if _ctx is None:
        set_ctx(Context.from_env())
    get_ctx().queue.start()
    diag.log("startup", experts=get_ctx().catalogue.count())
    yield
    await get_ctx().queue.stop()


app = FastAPI(title="Keplar Wants swarm", version="0.1.0", lifespan=lifespan)
app.add_middleware(BodyLimit, limit=MAX_BODY_BYTES)


@app.exception_handler(RequestValidationError)
async def _bad_request(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Malformed JSON and schema violations are the caller's error: 400, with the first problem (no echo of the input).
    first = (exc.errors() or [{}])[0]
    where = ".".join(str(x) for x in first.get("loc", []) if x != "body")
    diag.log("bad_request", where=where, kind=first.get("type"))
    return _error(400, "invalid", f"Invalid request{f' at {where}' if where else ''}: {first.get('msg', 'malformed input')}.")


@app.exception_handler(HTTPException)
async def _http_error(_: Request, exc: HTTPException) -> JSONResponse:
    codes = {401: "unauthorized", 404: "not_found", 429: "rate_limited", 503: "starting", 504: "timeout"}
    return _error(exc.status_code, codes.get(exc.status_code, "error"), str(exc.detail), **({"retry_after": exc.headers.get("retry-after")} if exc.headers and "retry-after" in exc.headers else {}))


@app.exception_handler(Exception)
async def _crash(_: Request, exc: Exception) -> JSONResponse:
    diag.log("handler_error", error=f"{type(exc).__name__}: {str(exc)[:200]}")
    return _error(500, "server", "Keplar hit a problem. Try again.")


def rate_limit(key: str) -> None:
    wait = BUCKET.take(key)
    if wait:
        diag.log("rate_limited", key=key[:80], retry_after=round(wait, 1))
        raise HTTPException(429, "Too many requests. Slow down a little.", headers={"retry-after": str(int(wait) + 1)})


def client_key(request: Request) -> str:
    return f"ip:{request.client.host if request.client else 'unknown'}"


def require_caller(authorization: str = Header(default="")) -> None:
    token = os.environ.get("KEPLAR_WANTS_SWARM_TOKEN", "")
    if not token or not hmac.compare_digest(authorization.encode(), f"Bearer {token}".encode()):
        raise HTTPException(401, "Unauthorized.")


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


def _line(ev: dict) -> bytes:
    return (json.dumps(ev, ensure_ascii=False, default=str) + "\n").encode()


async def bounded_stream(events: AsyncIterator[dict], route: str, timeout_s: float | None = None) -> AsyncIterator[bytes]:
    """Streams NDJSON under one hard deadline for the whole turn. On timeout or any error it sends a structured fallback
    card the tab can show, closes the turn's generator (cancelling what it awaited) and ends the stream cleanly."""
    deadline = asyncio.get_running_loop().time() + (ROUTE_TIMEOUT_S if timeout_s is None else timeout_s)
    it = events.__aiter__()
    try:
        while True:
            left = deadline - asyncio.get_running_loop().time()
            if left <= 0:
                raise asyncio.TimeoutError
            try:
                ev = await asyncio.wait_for(it.__anext__(), left)
            except StopAsyncIteration:
                return
            yield _line(ev)
    except asyncio.TimeoutError:
        diag.log("route_timeout", route=route, timeout_s=ROUTE_TIMEOUT_S if timeout_s is None else timeout_s)
        yield _line({"type": "card", "card": {"kind": "error", "code": "timeout", "message": "That step took too long, so Keplar stopped it. Send it again."}})
    except Exception as e:  # noqa: BLE001
        diag.log("stream_error", route=route, error=f"{type(e).__name__}: {str(e)[:200]}")
        yield _line({"type": "card", "card": {"kind": "error", "code": "server", "message": "Keplar hit a problem on that step. Send it again."}})
    finally:
        aclose = getattr(it, "aclose", None)
        if aclose:
            try:
                await aclose()
            except Exception:  # noqa: BLE001
                pass


@app.post("/v1/orchestrate", dependencies=[Depends(require_caller)])
async def orchestrate(req: OrchestrateRequest, ctx: Context = Depends(get_ctx)) -> StreamingResponse:
    rate_limit(f"user:{req.user.id}")
    return StreamingResponse(bounded_stream(run_turn(req, ctx), "/v1/orchestrate"), media_type="application/x-ndjson")


@app.get("/v1/jobs/{job_id}", dependencies=[Depends(require_caller)])
async def job(job_id: str, request: Request, ctx: Context = Depends(get_ctx)) -> dict:
    rate_limit(client_key(request))
    if not (8 <= len(job_id) <= 64 and job_id.isalnum()):
        raise HTTPException(404, "No such job.")
    j = ctx.queue.jobs.get(job_id)
    if not j:
        raise HTTPException(404, "No such job.")
    return j.view()


@app.get("/v1/connectors", dependencies=[Depends(require_caller)])
async def connectors(request: Request, ctx: Context = Depends(get_ctx)) -> dict:
    rate_limit(client_key(request))
    return {"connectors": ctx.connectors.all()}


class OAuthStart(BaseModel):
    user_id: str = Field(min_length=1, max_length=80)
    redirect_uri: str = Field(pattern=r"^https://", max_length=300)


@app.post("/v1/connectors/{cid}/oauth/start", dependencies=[Depends(require_caller)])
async def oauth_start(cid: str, body: OAuthStart, ctx: Context = Depends(get_ctx)) -> dict:
    rate_limit(f"user:{body.user_id}")
    c = ctx.connectors.get(cid[:40])
    if not isinstance(c, OAuth2Connector):
        # A placeholder: no sign-in exists yet. Describe it instead of failing, so the tab can offer Palmo or a hand-off.
        return {"url": None, "connector": c.describe()}
    try:
        return {"url": c.start(body.user_id, body.redirect_uri, ctx.signer), "connector": c.describe()}
    except RuntimeError as e:
        return {"url": None, "connector": c.describe(), "message": str(e)}


@app.get("/v1/connectors/{cid}/oauth/callback")
async def oauth_callback(cid: str, request: Request, code: str = "", state: str = "", ctx: Context = Depends(get_ctx)) -> RedirectResponse:
    c = ctx.connectors.get(cid)
    back = os.environ.get("KEPLAR_WANTS_RETURN_URL", "https://keplar.one/app/wants")
    if not isinstance(c, OAuth2Connector) or not code or not state:
        return RedirectResponse(f"{back}?connected=0")
    rate_limit(client_key(request))
    if len(code) > 2048 or len(state) > 4096:
        return RedirectResponse(f"{back}?connected=0")
    try:
        await bounded(c.finish(code, state, str(request.url_for("oauth_callback", cid=cid)), ctx.signer, ctx.tokens), "oauth_callback")
    except Exception as e:  # noqa: BLE001
        diag.api_failure(f"oauth:{cid}", e)
        return RedirectResponse(f"{back}?connected=0")
    return RedirectResponse(f"{back}?connected={cid}")


class PinBody(BaseModel):
    user_id: str = Field(min_length=1, max_length=80)
    pin: str = Field(pattern=r"^\d{4,6}$")


@app.put("/v1/pin", dependencies=[Depends(require_caller)])
async def put_pin(body: PinBody, ctx: Context = Depends(get_ctx)) -> dict:
    rate_limit(f"user:{body.user_id}")
    await bounded(asyncio.to_thread(ctx.pins.set, body.user_id, body.pin), "pin")
    return {"ok": True}


@app.get("/v1/diagnostics", dependencies=[Depends(require_caller)])
async def diagnostics(request: Request) -> dict:
    rate_limit(client_key(request))
    return diag.METRICS.snapshot()
