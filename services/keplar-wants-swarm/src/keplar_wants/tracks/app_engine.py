"""Track A: app / game engine. Questionnaire -> spec frame -> files frame -> files written into the person's contained
workspace (sandbox.ContainedWriter; no shell, no subprocess) -> a "workspace" card listing what was written."""
from __future__ import annotations

import re
from typing import AsyncIterator

from ..agents import ROUTER, Frame
from ..context import Context
from ..models import Event, Track, WantsState, card, say, trace
from ..sandbox import ContainedWriter, ContainmentError
from .questions import APP, ROBLOX, next_question_card


def _user_dir(user_id: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", user_id.lower()).strip("-")[:40] or "user"


async def run(state: WantsState, user_id: str, ctx: Context) -> AsyncIterator[Event]:
    qs = ROBLOX if state.intent == "roblox" else APP
    q = next_question_card(qs, state)
    if q:
        yield {"type": "card", "card": q}
        return

    spec = ROUTER.dispatch(Frame("spec", state.want, Track.APP_GAME, dict(state.answers)))
    yield trace(stage="plan", subtasks=[{"expert": a, "task": "spec"} for a in spec.log if not a.startswith("tap.")])
    if not spec.data.get("spec_ok"):
        yield card("error", message=f"The spec is incomplete: {', '.join(spec.data.get('spec_problems', []))}.")
        return
    files = ROUTER.dispatch(Frame("files", state.want, Track.APP_GAME, dict(state.answers), dict(spec.data)))
    project = spec.data["slug"]
    root = ctx.workspace_root / _user_dir(user_id) / project
    try:
        writer = ContainedWriter(root)
        written = writer.write_all(files.data.get("files", []))
    except (ContainmentError, OSError) as e:
        yield card("error", message=f"Keplar didn't write the files: {e}")
        return
    yield say(f"Wrote {len(written)} files for {spec.data['name']}.")
    yield card(
        "workspace",
        name=spec.data["name"],
        platform=spec.data["platform"],
        root=f"{_user_dir(user_id)}/{project}",
        files=[{"path": p, "bytes": b} for p, b in written],
        # The tab can also run the full in-app build (Create pipeline) or Keplar Studio from this prompt.
        prompt=f"Build {state.want}. " + " ".join(f"{k}: {v}." for k, v in state.answers.items()),
    )
