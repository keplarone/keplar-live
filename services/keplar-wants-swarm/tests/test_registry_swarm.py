"""The virtual agent registry: catalogue size and memory, selection, the cache, and the error / timeout gates + diagnostics."""
import asyncio
import json
import tracemalloc

from keplar_wants import diagnostics as diag
from keplar_wants.registry_swarm import (
    BASELINE_ID, CATALOGUE_MAX, HOOKS, Catalogue, JobQueue, SimulatedExecutor, SwarmPipeline, generate_profiles,
)


def lines(path):
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


def test_catalogue_holds_100k_without_loading_it_into_memory():
    assert CATALOGUE_MAX == 100_000
    tracemalloc.start()
    c = Catalogue(":memory:")
    assert c.populate() == 100_000
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    assert peak < 40_000_000  # Python-side peak stays small: rows stream in batches into SQLite
    assert len({r[0] for r in generate_profiles(2000)}) == 2000


def test_select_picks_the_right_domain_and_a_diverse_subset(catalogue):
    picked = catalogue.select("I want a latte from a cafe near me")
    assert len(picked) == 3  # a 2-3 expert sub-cluster by default
    assert picked[0].domain == "coffee & cafés"
    assert len({p.role for p in picked}) == 3


def test_cache_hits_are_counted(catalogue):
    ids = [p.id for p in catalogue.select("roblox tycoon", k=3)]
    diag.METRICS.reset()
    catalogue.get(ids)
    catalogue.get(ids)
    snap = diag.METRICS.snapshot()
    assert snap["counters"]["cache_hit"] >= 3 and snap["cache_hit_rate"] > 0


def test_missing_profile_falls_back_to_baseline(catalogue, diag_log):
    out = catalogue.get([999_999_999])
    assert out[0].id == BASELINE_ID
    assert any(e["event"] == "profile_load_failed" and e["expert_id"] == 999_999_999 for e in lines(diag_log))


class Hangs(SimulatedExecutor):
    async def run(self, expert, task, context):
        await asyncio.sleep(30)


class Breaks(SimulatedExecutor):
    async def run(self, expert, task, context):
        raise RuntimeError("expert script crashed")


async def test_hung_step_is_cancelled_and_routed_to_a_verifier(catalogue, diag_log):
    ids = [p.id for p in catalogue.select("coffee", k=2)]
    events = []
    p = SwarmPipeline(catalogue, Hangs(), SimulatedExecutor(), step_timeout=0.2)
    t0 = asyncio.get_event_loop().time()
    out = await p.run("a coffee", ids, events.append, job_id="j1")
    assert asyncio.get_event_loop().time() - t0 < 3  # nothing waited for the 30 s hang
    assert len(out["recovered"]) == 2 and all(r["why"] == "timeout" for r in out["recovered"])
    assert all(s["hook"] == "verify" for s in out["steps"])  # the verification agent resolved each step
    log = lines(diag_log)
    assert sum(e["event"] == "step_timeout" for e in log) == 2
    assert any(e.get("stage") == "revise" for e in events)


async def test_crashing_step_falls_back_to_baseline_model(catalogue, diag_log):
    ids = [p.id for p in catalogue.select("pizza delivery", k=2)]
    out = await SwarmPipeline(catalogue, Breaks(), SimulatedExecutor(), step_timeout=2).run("pizza", ids, job_id="j2")
    assert len(out["steps"]) == 2 and not out["failed"]
    assert all(r["why"] == "error" for r in out["recovered"])
    errs = [e for e in lines(diag_log) if e["event"] == "step_error"]
    assert {e["expert_id"] for e in errs} == set(ids) and "crashed" in errs[0]["error"]


async def test_when_fallback_also_fails_the_step_is_lost_not_fatal(catalogue, diag_log):
    ids = [p.id for p in catalogue.select("flights", k=2)]
    out = await SwarmPipeline(catalogue, Breaks(), Breaks(), step_timeout=2).run("fly", ids, job_id="j3")
    assert len(out["failed"]) == 2 and out["steps"] == []
    assert sum(e["event"] == "step_lost" for e in lines(diag_log)) == 2


async def test_unknown_hook_in_a_row_is_contained(catalogue, diag_log):
    catalogue.db.execute("INSERT OR REPLACE INTO experts VALUES (?,?,?,?,?,?,?,?,?)", (90_000_001, "Broken", "research", "X", "y", "z", "s", "n", "no_such_hook"))
    out = catalogue.get([90_000_001])
    assert out[0].id == BASELINE_ID and "no_such_hook" not in HOOKS


async def test_job_queue_runs_in_background_and_streams(catalogue, diag_log):
    q = JobQueue(SwarmPipeline(catalogue, SimulatedExecutor(), SimulatedExecutor()), workers=2)
    job = await q.submit("a million dollars", [p.id for p in catalogue.select("million dollars wealth", k=3)])
    assert job.status in ("queued", "running")  # submit returned before the work finished
    seen = [e async for e in q.stream(job)]
    assert job.status == "done" and len(job.result["steps"]) == 3
    assert seen[-1] == {"stage": "job", "status": "done"}
    await q.stop()
    events = {e["event"] for e in lines(diag_log)}
    assert {"select", "profile_load", "step_ok", "job", "metrics"} <= events


async def test_cluster_is_flushed_from_memory_after_the_run(catalogue, diag_log):
    ids = [p.id for p in catalogue.select("sushi delivery tonight")]
    assert all(i in catalogue._cache for i in ids)
    await SwarmPipeline(catalogue, SimulatedExecutor(), SimulatedExecutor()).run("sushi", ids, job_id="flush")
    assert not any(i in catalogue._cache for i in ids)
    assert any(e["event"] == "cache_flush" and e["flushed"] == len(ids) for e in lines(diag_log))
