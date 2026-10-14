"""Track C: long-term goals ("a million dollars", "my own business") as an explicit state machine, ending in a plan from the
expert swarm and a Palmo hook.

States (stored in WantsState.goalState):

    ask --(all branch questions answered)--> plan --(swarm job done)--> offer_palmo
     ^  path=Business      -> niche
     |  path=Content       -> platform, topic
     |  every path         -> capital, time, skills, timeline

`PalmoHook` is the interface for the on-screen assistant. The default hook (`DesktopPalmoHook`) emits the goal for the tab,
which calls window.keplarPalmo.ask(goal, "for_me") in the Keplar desktop app (keplar-desktop src/preload/preload.ts).
Palmo asks the person before anything consequential; nothing here can approve that on their behalf.
"""
from __future__ import annotations

from typing import AsyncIterator, Protocol

from ..agents import ROUTER, Frame
from ..context import Context
from ..models import Event, Track, WantsState, card, trace
from ..registry_swarm import summarise
from .questions import GOAL, next_question_card

TRANSITIONS = {"ask": ("plan",), "plan": ("offer_palmo",), "offer_palmo": ()}


class PalmoHook(Protocol):
    def build(self, frame_data: dict) -> dict:
        """Returns the fields the tab needs to offer Palmo (at least `palmoGoal`)."""


class DesktopPalmoHook:
    def build(self, frame_data: dict) -> dict:
        return {"palmoGoal": frame_data.get("palmo_goal")}


def advance(cur: str, to: str) -> str:
    if to not in TRANSITIONS.get(cur, ()):
        raise ValueError(f"Illegal goal transition {cur} -> {to}")
    return to


async def run(state: WantsState, ctx: Context, hook: PalmoHook | None = None) -> AsyncIterator[Event]:
    hook = hook or DesktopPalmoHook()
    state.goalState = state.goalState or "ask"
    q = next_question_card(GOAL, state)
    if q:
        yield {"type": "card", "card": q}
        return
    if state.goalState == "ask":
        state.goalState = advance("ask", "plan")
    f = ROUTER.dispatch(Frame("goal", state.want, Track.GOAL, dict(state.answers)))

    # The expert swarm writes the plan in the background; this turn streams its progress.
    facts = "; ".join(f"{k}: {v}" for k, v in state.answers.items())
    task = f"Plan how this person gets {state.want}. {facts}. Target: {f.data.get('target_usd')}, needed per month: {f.data.get('per_month_usd')}."
    experts = ctx.catalogue.select(f"{state.want} {facts}", k=3)
    yield trace(stage="gate", experts=[{"n": e.id, "id": str(e.id), "name": e.name, "matched": []} for e in experts], asleep=ctx.catalogue.count() - len(experts))
    job = await ctx.queue.submit(task, [e.id for e in experts])
    async for ev in ctx.queue.stream(job):
        if ev.get("stage") in ("expert", "revise"):
            yield trace(**ev)
    result = job.result or {}
    state.goalState = advance("plan", "offer_palmo")
    yield {"type": "state", "state": state.model_dump(mode="json"), "label": "Make money"}
    ladder = " → ".join(f"${m:,.0f}" for m in f.data.get("milestones", []))
    md = f"### Your path: {f.data.get('path')}{' · ' + f.data['niche'] if f.data.get('niche') else ''}\n\nMilestones: {ladder}\n\n{summarise(result)}\n\n_{f.data.get('risk_note')}_"
    yield card("answer", markdown=md, nextSteps=["a weekly checklist for this plan", "to build the website for it", "to find my first customer"], experts=[{"n": e.id, "name": e.name} for e in experts], verified=bool(result.get("verified_by")), **hook.build(f.data))
