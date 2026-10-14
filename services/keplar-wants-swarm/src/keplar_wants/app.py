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

Run:  uvicorn keplar_wants.app:app --host 0.0.0.0 --port 8080
"""
from __future__ import annotations

import hmac
import json
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import diagnostics as diag
from .connectors import OAuth2Connector
from .context import Context
from .engine import run_turn
from .models import OrchestrateRequest

_ctx: Optional[Context] = None


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


def require_caller(authorization: str = Header(default="")) -> None:
    token = os.environ.get("KEPLAR_WANTS_SWARM_TOKEN", "")
    if not token or not hmac.compare_digest(authorization.encode(), f"Bearer {token}".encode()):
        raise HTTPException(401, "Unauthorized.")


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


@app.post("/v1/orchestrate", dependencies=[Depends(require_caller)])
async def orchestrate(req: OrchestrateRequest, ctx: Context = Depends(get_ctx)) -> StreamingResponse:
    async def lines() -> AsyncIterator[bytes]:
        async for ev in run_turn(req, ctx):
            yield (json.dumps(ev, ensure_ascii=False, default=str) + "\n").encode()

    return StreamingResponse(lines(), media_type="application/x-ndjson")


@app.get("/v1/jobs/{job_id}", dependencies=[Depends(require_caller)])
async def job(job_id: str, ctx: Context = Depends(get_ctx)) -> dict:
    j = ctx.queue.jobs.get(job_id)
    if not j:
        raise HTTPException(404, "No such job.")
    return j.view()


@app.get("/v1/connectors", dependencies=[Depends(require_caller)])
async def connectors(ctx: Context = Depends(get_ctx)) -> dict:
    return {"connectors": ctx.connectors.all()}


class OAuthStart(BaseModel):
    user_id: str = Field(min_length=1, max_length=80)
    redirect_uri: str = Field(pattern=r"^https://", max_length=300)


@app.post("/v1/connectors/{cid}/oauth/start", dependencies=[Depends(require_caller)])
async def oauth_start(cid: str, body: OAuthStart, ctx: Context = Depends(get_ctx)) -> dict:
    c = ctx.connectors.get(cid)
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
    try:
        await c.finish(code, state, str(request.url_for("oauth_callback", cid=cid)), ctx.signer, ctx.tokens)
    except Exception as e:  # noqa: BLE001
        diag.api_failure(f"oauth:{cid}", e)
        return RedirectResponse(f"{back}?connected=0")
    return RedirectResponse(f"{back}?connected={cid}")


class PinBody(BaseModel):
    user_id: str = Field(min_length=1, max_length=80)
    pin: str = Field(pattern=r"^\d{4,6}$")


@app.put("/v1/pin", dependencies=[Depends(require_caller)])
async def put_pin(body: PinBody, ctx: Context = Depends(get_ctx)) -> dict:
    ctx.pins.set(body.user_id, body.pin)
    return {"ok": True}


@app.get("/v1/diagnostics", dependencies=[Depends(require_caller)])
async def diagnostics() -> dict:
    return diag.METRICS.snapshot()
