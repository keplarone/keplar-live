"""Sandbox containment, intent routing, the sub-agent map and connectors."""
import os

import httpx
import pytest

from keplar_wants.agents import AGENTS, ROUTER, Frame
from keplar_wants.connectors import REGISTRY, DoorDashConnector, Order, PlaceholderConnector, StateSigner, TokenStore
from keplar_wants.intents import route
from keplar_wants.models import Track
from keplar_wants.sandbox import ActionGate, ContainedWriter, ContainmentError


# ── sandbox ──

@pytest.mark.parametrize("bad", ["../x.html", "/etc/passwd.txt", "a/../../b.js", "C:/x.js", "a\\b.js", "ok/\x00.js", ".ssh/id.txt", "run.sh", "x.exe", ""])
def test_writer_refuses_escapes_and_bad_types(tmp_path, bad):
    with pytest.raises(ContainmentError):
        ContainedWriter(tmp_path / "ws").write(bad, "x")


def test_writer_refuses_symlinked_parent(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    ws = tmp_path / "ws"
    ws.mkdir()
    os.symlink(outside, ws / "link")
    with pytest.raises(ContainmentError):
        ContainedWriter(ws).write("link/a.html", "x")
    assert not (outside / "a.html").exists()


def test_write_all_is_all_or_nothing(tmp_path):
    w = ContainedWriter(tmp_path / "ws")
    with pytest.raises(ContainmentError):
        w.write_all([("index.html", "ok"), ("../evil.js", "x")])
    assert not (tmp_path / "ws" / "index.html").exists()


def test_writer_writes_inside(tmp_path):
    w = ContainedWriter(tmp_path / "ws")
    w.write("src/app.js", "1")
    assert (tmp_path / "ws" / "src" / "app.js").read_text() == "1"


def test_action_gate(tmp_path):
    g = ActionGate(ContainedWriter(tmp_path / "ws"))
    g.check({"kind": "write_file", "path": "a.html"})
    g.check({"kind": "open_url", "url": "https://keplar.one/x"})
    for bad in ({"kind": "shell", "cmd": "rm -rf /"}, {"kind": "open_url", "url": "file:///etc/passwd"}, {"kind": "write_file", "path": "../a.html"}, {"kind": "list_dir", "path": "../"}):
        with pytest.raises(ContainmentError):
            g.check(bad)


# ── intents (the examples from the brief) ──

@pytest.mark.parametrize("want,track,intent", [
    ("to build an app", Track.APP_GAME, "build_app"),
    ("to build a roblox game", Track.APP_GAME, "roblox"),
    ("a coffee", Track.COMMERCE, "food"),
    ("a million dollars", Track.GOAL, "money"),
    ("to understand black holes", Track.GENERAL, "general"),
])
def test_route(want, track, intent):
    assert route(want) == (track, intent)


# ── sub-agent map ──

def test_at_least_50_agents_with_unique_ids():
    assert len(AGENTS) >= 50
    assert len({a.id for a in AGENTS}) == len(AGENTS)
    routes = ROUTER.routes()
    assert {"spec", "files", "scan", "order", "goal"} <= set(routes)


def test_frame_skips_agents_missing_inputs():
    f = ROUTER.dispatch(Frame("order", "a coffee", Track.COMMERCE, {}, {}))
    assert "commerce.order" in f.skipped  # needs `place`
    assert "order" not in f.data


def test_goal_agents_parse_money():
    f = ROUTER.dispatch(Frame("goal", "a million dollars", Track.GOAL, {"capital": "$500 – $2,000", "timeline": "5 years", "path": "Business"}))
    assert f.data["target_usd"] == 1_000_000
    assert f.data["capital_usd"] == 2000
    assert f.data["per_month_usd"] == round(1_000_000 / 60)
    assert f.data["palmo_goal"]


# ── connectors ──

def test_unknown_service_gets_placeholder_not_error():
    c = REGISTRY.get("Airbnb")
    assert isinstance(c, PlaceholderConnector)
    d = c.describe()
    assert d["status"] == "placeholder" and "place_order" in d["spec"]["operations"]


async def test_placeholder_never_claims_an_order():
    r = await REGISTRY.get("Some Shop").place_order(None, Order("X", ["y"], None, "pickup"))
    assert r.status == "handoff"


async def test_oauth_pkce_roundtrip(monkeypatch):
    monkeypatch.setenv("DOORDASH_CLIENT_ID", "cid")
    monkeypatch.setenv("DOORDASH_CLIENT_SECRET", "sec")
    c = DoorDashConnector()
    c.authorize_endpoint, c.token_endpoint = "https://auth.example/authorize", "https://auth.example/token"
    signer, store = StateSigner("k"), TokenStore()
    url = c.start("user-1", "https://keplar.one/cb", signer)
    assert "code_challenge_method=S256" in url
    state = httpx.URL(url).params["state"]
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = req.content.decode()
        return httpx.Response(200, json={"access_token": "at", "refresh_token": "rt", "expires_in": 60})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        user = await c.finish("code-1", state, "https://keplar.one/cb", signer, store, client)
    assert user == "user-1" and "code_verifier=" in seen["body"]
    assert store.get("user-1", "doordash").access_token == "at"
    with pytest.raises(ValueError):
        await c.finish("code-1", state[:-2] + "xx", "https://keplar.one/cb", signer, store)


def test_oauth_start_without_credentials_explains(monkeypatch):
    monkeypatch.delenv("DOORDASH_CLIENT_ID", raising=False)
    assert DoorDashConnector().status() == "needs_credentials"
    with pytest.raises(RuntimeError):
        DoorDashConnector().start("u", "https://x/cb", StateSigner("k"))
