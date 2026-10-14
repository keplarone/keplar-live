"""Deterministic boundaries: bad input -> clean 400s, rate limit -> 429, timeouts -> fallback, memory ceiling, 5-row paging,
OAuth validation before any order hook, and atomic, contained writes. Nothing here may crash or hang the server."""
import asyncio
import json
import time

import httpx
import pytest

from keplar_wants import orchestrator as orch
from keplar_wants import registry_swarm as rs
from keplar_wants.connectors import (
    DoorDashConnector, Order, OrderResult, PlaceholderConnector, TokenSet, TokenValidator, place_order_validated,
)
from keplar_wants.sandbox import ContainedWriter, ContainmentError

AUTH = {"authorization": "Bearer test-token"}
USER = {"id": "user-1", "plan": "plus"}


def lines(path):
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


@pytest.fixture
async def client(ctx, monkeypatch):
    monkeypatch.setattr(orch, "BUCKET", orch.TokenBucket(1000))
    orch.set_ctx(ctx)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=orch.app), base_url="http://swarm") as c:
        yield c
    orch.set_ctx(None)


# ── 400s for invalid, oversized and malformed input ──

@pytest.mark.parametrize("body", [
    {"input": {"want": "a coffee"}},                                   # no user
    {"input": {"want": 42}, "user": USER},                             # wrong type
    {"input": {"want": "x" * 801}, "user": USER},                      # over the field limit
    {"input": {"pin": "12ab"}, "user": USER},                          # PIN pattern
    {"input": {"location": {"lat": 999, "lon": 0}}, "user": USER},     # out of range
    {"state": {"want": "a", "track": "rm -rf"}, "input": {}, "user": USER},  # not a route
    {"input": {}, "user": {"id": ""}},                                 # empty id
    [],                                                                # not an object
])
async def test_invalid_input_is_a_clean_400(client, body):
    r = await client.post("/v1/orchestrate", headers=AUTH, json=body)
    assert r.status_code == 400, r.text
    assert r.json()["code"] == "invalid" and r.json()["error"]


async def test_malformed_json_is_a_400(client):
    r = await client.post("/v1/orchestrate", headers={**AUTH, "content-type": "application/json"}, content=b'{"input": {"want": "a coffee"')
    assert r.status_code == 400 and r.json()["code"] == "invalid"


async def test_oversized_body_is_a_400_before_parsing(client):
    r = await client.post("/v1/orchestrate", headers={**AUTH, "content-type": "application/json"}, content=b'{"x":"' + b"a" * (orch.MAX_BODY_BYTES + 10) + b'"}')
    assert r.status_code == 400 and r.json()["code"] == "too_large"


async def test_bad_job_id_and_unknown_routes_are_json(client):
    r = await client.get("/v1/jobs/../../etc", headers=AUTH)
    assert r.status_code in (400, 404)
    r = await client.get("/v1/jobs/zz", headers=AUTH)
    assert r.status_code == 404 and r.json()["code"] == "not_found"


async def test_server_keeps_serving_after_a_track_crash(client, ctx, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("bug")
    monkeypatch.setattr(ctx.catalogue, "select", boom)
    r = await client.post("/v1/orchestrate", headers=AUTH, json={"input": {"want": "I want to understand tides"}, "user": USER})
    cards = [json.loads(x)["card"] for x in r.text.splitlines() if json.loads(x)["type"] == "card"]
    assert r.status_code == 200 and cards[-1]["kind"] == "error"
    assert (await client.get("/healthz")).json() == {"ok": True}


# ── rate limit ──

async def test_sixty_calls_per_minute_then_429(ctx, monkeypatch):
    t = [0.0]
    monkeypatch.setattr(orch, "BUCKET", orch.TokenBucket(60, now=lambda: t[0]))
    orch.set_ctx(ctx)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=orch.app), base_url="http://swarm") as c:
        body = {"input": {"want": "I want a coffee"}, "user": USER}
        codes = [(await c.post("/v1/orchestrate", headers=AUTH, json=body)).status_code for _ in range(61)]
        assert codes[:60] == [200] * 60 and codes[60] == 429
        r = await c.post("/v1/orchestrate", headers=AUTH, json=body)
        assert r.json()["code"] == "rate_limited" and int(r.json()["retry_after"]) >= 1
        other = await c.post("/v1/orchestrate", headers=AUTH, json={**body, "user": {"id": "user-2"}})
        assert other.status_code == 200  # per session, not global
        t[0] += 1.0  # one token back per second
        assert (await c.post("/v1/orchestrate", headers=AUTH, json=body)).status_code == 200
    orch.set_ctx(None)


# ── timeouts ──

async def test_stream_deadline_sends_a_fallback_card_and_stops():
    closed = []

    async def slow():
        try:
            yield {"type": "say", "text": "started"}
            await asyncio.sleep(30)
            yield {"type": "say", "text": "never"}
        finally:
            closed.append(True)

    t0 = time.monotonic()
    out = [json.loads(b) async for b in orch.bounded_stream(slow(), "test", timeout_s=0.3)]
    assert time.monotonic() - t0 < 2
    assert out[0]["text"] == "started"
    assert out[-1]["card"]["code"] == "timeout"
    assert closed == [True]  # the turn's generator was closed (its sleep cancelled)


async def test_route_timeout_is_a_504(monkeypatch):
    monkeypatch.setattr(orch, "ROUTE_TIMEOUT_S", 0.1)
    with pytest.raises(orch.HTTPException) as e:
        await orch.bounded(asyncio.sleep(5), "test")
    assert e.value.status_code == 504


# ── memory ceiling and paging ──

class Huge(rs.SimulatedExecutor):
    async def run(self, expert, task, context):
        return "x" * 20_000


async def test_task_over_the_memory_limit_is_stopped_with_the_token(catalogue, diag_log, monkeypatch):
    monkeypatch.setattr(rs, "TASK_MEMORY_LIMIT", 10_000)
    ids = [p.id for p in catalogue.select("coffee")]
    out = await rs.SwarmPipeline(catalogue, Huge(), Huge()).run("coffee", ids, job_id="big")
    assert out["stopped"] == "ResourceLimitExceeded" and out["steps"] == []
    assert any(e["event"] == "ResourceLimitExceeded" and e["limit"] == 10_000 for e in lines(diag_log))


def test_default_ceiling_is_50mb():
    assert rs.TASK_MEMORY_LIMIT == 50 * 1024 * 1024


def test_lookups_stream_five_rows_per_batch(catalogue):
    queries = []
    catalogue.evict(list(range(1, 13)))
    catalogue.db.set_trace_callback(lambda q: queries.append(q) if "FROM experts WHERE id IN" in q else None)
    try:
        got = catalogue.get(list(range(1, 13)))
    finally:
        catalogue.db.set_trace_callback(None)
    assert [p.id for p in got] == list(range(1, 13))
    # the traced SQL has the ids inlined: at most 5 per IN (...) list
    assert len(queries) == 3 and all(q.split("IN (")[1].count(",") <= 4 for q in queries)


# ── OAuth 2.0 validation before any order hook ──

class Spy(DoorDashConnector):
    calls = 0

    async def place_order(self, token, order):
        Spy.calls += 1
        return OrderResult("placed", "ok")


@pytest.fixture
def live_connector(monkeypatch):
    monkeypatch.setenv("DOORDASH_CLIENT_ID", "cid")
    monkeypatch.setenv("DOORDASH_CLIENT_SECRET", "sec")
    c = Spy()
    c.authorize_endpoint, c.token_endpoint = "https://a/auth", "https://a/token"
    Spy.calls = 0
    return c


ORDER = Order("Dunkin'", ["Latte"], "1 Main St", "delivery")
GOOD = TokenSet("a" * 32, "r", time.time() + 3600, "orders.write profile.read")


@pytest.mark.parametrize("token,why", [
    (None, "isn't connected"),
    (TokenSet("a" * 32, None, time.time() - 1, "orders.write"), "expired"),
    (TokenSet("a" * 32, None, time.time() + 3600, "profile.read"), "permission"),
    (TokenSet("bad token with spaces!!", None, time.time() + 3600, "orders.write"), "malformed"),
    (TokenSet("short", None, time.time() + 3600, "orders.write"), "malformed"),
])
async def test_invalid_tokens_never_reach_the_connector(live_connector, token, why):
    r = await place_order_validated(live_connector, token, ORDER)
    assert r.status == "needs_connection" and why in r.message
    assert Spy.calls == 0


async def test_valid_token_reaches_the_connector(live_connector):
    assert TokenValidator().validate(live_connector, GOOD, "orders.write").ok
    r = await place_order_validated(live_connector, GOOD, ORDER)
    assert r.status == "placed" and Spy.calls == 1


async def test_placeholder_is_never_called_and_hands_off():
    class P(PlaceholderConnector):
        async def place_order(self, token, order):
            raise AssertionError("must not be called")
    r = await place_order_validated(P(id="airbnb", name="Airbnb"), GOOD, ORDER)
    assert r.status == "handoff"


async def test_connector_errors_become_a_handoff(live_connector, diag_log):
    class Broken(Spy):
        async def place_order(self, token, order):
            raise httpx.ConnectError("down")
    b = Broken()
    b.authorize_endpoint, b.token_endpoint = "https://a/auth", "https://a/token"
    r = await place_order_validated(b, GOOD, ORDER)
    assert r.status == "failed" and r.link
    assert any(e["event"] == "api_failure" and e["target"] == "connector:doordash" for e in lines(diag_log))


# ── atomic, contained writes ──

def test_failed_write_leaves_no_partial_file_and_rolls_back(tmp_path):
    w = ContainedWriter(tmp_path / "ws")
    (tmp_path / "ws" / "b.html").mkdir()  # a directory where the second file should go: the rename fails
    with pytest.raises(ContainmentError):
        w.write_all([("a.html", "1"), ("b.html", "2")])
    assert not (tmp_path / "ws" / "a.html").exists()  # rolled back
    assert not list((tmp_path / "ws").glob(".*.tmp"))
    assert w.written == []
