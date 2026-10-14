"""One turn: apply the person's input to the state, route the want to its track, stream the track's events.

Design rule ("no out-of-scope errors"): every path ends in a card the person can act on: a question, a place to pick, a
connector to connect (a generated placeholder when the integration doesn't exist), a hand-off to Palmo, or the swarm's
answer. Exceptions inside a track become an error card with a retry, never a dead end, and are logged to diagnostics.
"""
from __future__ import annotations

from typing import AsyncIterator, Optional

import httpx

from . import diagnostics as diag
from .context import Context
from .intents import clean_want, route
from .models import Event, Location, LocationQuery, OrchestrateRequest, Track, WantsState, card, say, trace
from .registry_swarm import summarise
from .tracks import app_engine, commerce, goals

LABEL = {Track.APPS_ENGINE: "Build it", Track.LOGISTICS_GATEWAY: "Order it", Track.CAP_ROUTE: "Make money", Track.GENERAL: "Get it done"}


async def geocode(q: str) -> Optional[Location]:
    try:
        async with httpx.AsyncClient(timeout=5, headers={"user-agent": "KeplarWantsSwarm/0.1 (+https://keplar.one)"}) as c:
            r = await c.get("https://nominatim.openstreetmap.org/search", params={"format": "json", "limit": 1, "q": q[:200]})
            r.raise_for_status()
            hit = (r.json() or [None])[0]
    except (httpx.HTTPError, ValueError) as e:
        diag.api_failure("nominatim", e)
        return None
    return Location(lat=float(hit["lat"]), lon=float(hit["lon"]), label=str(hit.get("display_name", ""))[:120]) if hit else None


async def apply_input(req: OrchestrateRequest, geo=geocode) -> tuple[Optional[WantsState], Optional[str]]:
    i = req.input
    if i.want:
        want = clean_want(i.want)
        if not want:
            return None, "Say what you want first."
        track, intent = route(want)
        return WantsState(want=want, track=track, intent=intent), None
    s = req.state
    if not s:
        return None, "Say what you want first."
    s = s.model_copy(deep=True)
    if i.slot and i.answer is not None and i.slot not in s.answers:
        s.answers[i.slot] = i.answer.strip()[:400] or "No preference"
    if isinstance(i.location, Location):
        s.location, s.places, s.placeId = i.location, None, None
    elif isinstance(i.location, LocationQuery):
        loc = await geo(i.location.query)
        if not loc:
            return s, "Keplar couldn't find that address. Try a street and city, or a ZIP code."
        s.location, s.places, s.placeId = loc, None, None
    if i.placeId and s.places and any(p.id == i.placeId for p in s.places):
        s.placeId = i.placeId
    if i.fulfilment:
        s.fulfilment = i.fulfilment
    if i.address:
        s.address = i.address.strip()[:200]
    if i.delivery:
        s.delivery = "".join(ch for ch in i.delivery.lower() if ch.isalnum())[:40]
    return s, None


async def general(state: WantsState, ctx: Context) -> AsyncIterator[Event]:
    experts = ctx.catalogue.select(state.want, k=3)
    yield trace(stage="gate", experts=[{"n": e.id, "id": str(e.id), "name": e.name, "matched": []} for e in experts], asleep=ctx.catalogue.count() - len(experts))
    yield trace(stage="plan", subtasks=[{"expert": f"#{e.id} {e.name}", "task": e.role} for e in experts])
    job = await ctx.queue.submit(f"Get this person what they want: {state.want}", [e.id for e in experts])
    async for ev in ctx.queue.stream(job):
        if ev.get("stage") in ("expert", "revise"):
            yield trace(**ev)
    result = job.result or {}
    yield trace(stage="final")
    yield card("answer", markdown=summarise(result), nextSteps=[], experts=[{"n": e.id, "name": e.name} for e in experts], verified=bool(result.get("verified_by")))


async def run_turn(req: OrchestrateRequest, ctx: Context, geo=geocode) -> AsyncIterator[Event]:
    state, problem = await apply_input(req, geo)
    if problem:
        yield say(problem)
    if not state:
        yield card("error", message=problem or "Say what you want first.")
        return
    yield {"type": "state", "state": state.model_dump(mode="json"), "label": LABEL[state.track]}
    try:
        # A closed set of routes, each a hard-coded path. Unknown values can't reach here (WantsState validates the enum).
        match state.track:
            case Track.APPS_ENGINE:
                gen = app_engine.run(state, req.user.id, ctx)
            case Track.LOGISTICS_GATEWAY:
                gen = commerce.run(state, req.user.id, ctx, req.input.pin, bool(req.input.confirm))
            case Track.CAP_ROUTE:
                gen = goals.run(state, ctx)
            case Track.GENERAL:
                gen = general(state, ctx)
        async for ev in gen:
            yield ev
    except Exception as e:  # noqa: BLE001 - a track bug becomes a retryable card, never a frozen chat
        diag.log("track_error", track=state.track.value, error=f"{type(e).__name__}: {str(e)[:200]}", user=req.user.id)
        yield card("error", message="Keplar hit a problem on that step. Send it again.")
    # Tracks update the state as they go (places found, PIN confirmed, goal stage): the client keeps the final copy.
    yield {"type": "state", "state": state.model_dump(mode="json"), "label": LABEL[state.track]}
