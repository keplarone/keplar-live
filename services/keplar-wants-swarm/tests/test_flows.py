"""End-to-end turns through the engine and the HTTP endpoint (the brief's examples: app, Roblox game, coffee, a million dollars)."""
import json

import httpx

from keplar_wants import app as app_module
from keplar_wants.engine import run_turn
from keplar_wants.models import Location, OrchestrateRequest, WantsState

USER = {"id": "user-1", "plan": "plus"}


async def turn(ctx, state, **inp):
    req = OrchestrateRequest(state=state, input=inp, user=USER)
    evs = [e async for e in run_turn(req, ctx, geo=fake_geo)]
    states = [e["state"] for e in evs if e["type"] == "state"]
    cards = [e["card"] for e in evs if e["type"] == "card"]
    return (WantsState(**states[-1]) if states else None), (cards[-1] if cards else None), evs


async def fake_geo(q):
    return Location(lat=40.7128, lon=-74.006, label=q)


async def answer_all(ctx, s, c, pick=None):
    while c and c["kind"] == "question":
        want = (pick or {}).get(c["slot"])
        opt = next(o for o in c["options"] if (o["label"] == want if want else not o.get("other")))
        s, c, _ = await turn(ctx, s, slot=c["slot"], answer=opt["label"])
    return s, c


async def test_build_an_app_asks_then_writes_contained_files(ctx):
    s, c, _ = await turn(ctx, None, want="I want to build an app")
    assert c["kind"] == "question" and c["step"] == 1
    s, c = await answer_all(ctx, s, c)
    assert c["kind"] == "workspace"
    paths = {f["path"] for f in c["files"]}
    assert {"index.html", "styles.css", "app.js", "README.md"} <= paths
    assert (ctx.workspace_root / "user-1").is_dir()
    for f in ctx.workspace_root.rglob("*"):
        assert f.resolve().is_relative_to(ctx.workspace_root.resolve())


async def test_roblox_game_writes_luau(ctx):
    s, c, _ = await turn(ctx, None, want="I want to build a roblox tycoon game")
    assert c["slot"] == "loop"  # genre was in the want: skipped
    s, c = await answer_all(ctx, s, c)
    assert c["kind"] == "workspace" and any(f["path"].endswith(".server.lua") for f in c["files"])


async def test_coffee_full_flow_to_handoff(ctx):
    s, c, _ = await turn(ctx, None, want="I want a coffee")
    assert c["question"] == "What type of coffee do you want?"
    s, c = await answer_all(ctx, s, c, {"source": "Cheapest"})
    assert c["kind"] == "location"
    s, c, _ = await turn(ctx, s, location={"query": "10001"})
    assert c["kind"] == "places"
    levels = [p["priceLevel"] for p in c["places"]]
    assert levels == sorted(levels) and all(p["simulated"] for p in c["places"])  # cheap -> expensive
    s, c, _ = await turn(ctx, s, placeId=c["places"][0]["id"])
    assert c["kind"] == "fulfilment"
    s, c, _ = await turn(ctx, s, fulfilment="delivery")
    assert c["kind"] == "address"
    s, c, _ = await turn(ctx, s, address="1 Main St, New York")
    assert c["kind"] == "connect_delivery" and {x["id"] for x in c["connectors"]} == {"doordash", "ubereats", "grubhub"}
    s, c, _ = await turn(ctx, s, delivery="doordash")
    assert c["kind"] == "confirm_order" and c["confirmWith"] == "are_you_sure"
    s, c, _ = await turn(ctx, s, confirm=True)
    assert s.confirmed and c["kind"] == "place_order"
    assert c["service"] == "DoorDash" and "doordash.com" in c["link"] and "checkout" in c["goal"]


async def test_pin_is_enforced_when_set(ctx):
    ctx.pins.set("user-1", "4321")
    s, c, _ = await turn(ctx, None, want="I want a pizza")
    s, c = await answer_all(ctx, s, c)
    s, c, _ = await turn(ctx, s, location={"lat": 34.05, "lon": -118.24})
    s, c, _ = await turn(ctx, s, placeId=c["places"][0]["id"])
    s, c, _ = await turn(ctx, s, fulfilment="pickup")
    assert c["kind"] == "confirm_order" and c["confirmWith"] == "pin"
    s, c, evs = await turn(ctx, s, confirm=True, pin="0000")
    assert not s.confirmed and c["kind"] == "confirm_order"
    s, c, _ = await turn(ctx, s, confirm=True, pin="4321")
    assert s.confirmed and c["kind"] == "place_order"


async def test_million_dollars_branches_and_offers_palmo(ctx):
    s, c, _ = await turn(ctx, None, want="I want a million dollars")
    assert c["slot"] == "path"
    s, c, _ = await turn(ctx, s, slot="path", answer="Business")
    assert c["slot"] == "niche"  # the business branch
    s, c, _ = await turn(ctx, s, slot="niche", answer="My idea: mobile car detailing")
    s, c = await answer_all(ctx, s, c)
    assert c["kind"] == "answer" and c["palmoGoal"] and c["experts"]
    assert s.goalState == "offer_palmo"


async def test_general_want_uses_the_swarm(ctx):
    s, c, evs = await turn(ctx, None, want="I want to understand black holes")
    assert c["kind"] == "answer" and c["experts"]
    assert any(e["type"] == "trace" and e["event"]["stage"] == "gate" for e in evs)


async def test_endpoint_requires_token_and_streams(ctx):
    app_module.set_ctx(ctx)
    transport = httpx.ASGITransport(app=app_module.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://swarm") as client:
        r = await client.post("/v1/orchestrate", json={"input": {"want": "I want a coffee"}, "user": USER})
        assert r.status_code == 401
        r = await client.post("/v1/orchestrate", headers={"authorization": "Bearer test-token"}, json={"input": {"want": "I want a coffee"}, "user": USER})
        assert r.status_code == 200 and r.headers["content-type"].startswith("application/x-ndjson")
        evs = [json.loads(x) for x in r.text.splitlines()]
        assert evs[0]["type"] == "state" and evs[-1]["type"] == "state"
        assert any(e["type"] == "card" and e["card"]["kind"] == "question" for e in evs)
        r = await client.get("/v1/diagnostics", headers={"authorization": "Bearer test-token"})
        assert "cache_hit_rate" in r.json()
    app_module.set_ctx(None)


async def test_closest_sorts_by_distance(ctx):
    s, c, _ = await turn(ctx, None, want="I want a latte")
    s, c = await answer_all(ctx, s, c, {"source": "Closest to me"})
    s, c, _ = await turn(ctx, s, location={"lat": 51.5, "lon": -0.12})
    d = [p["distanceKm"] for p in c["places"]]
    assert d == sorted(d)
