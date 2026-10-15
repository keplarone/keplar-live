import "./setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
process.env.KEPLAR_SPIKE_USD = "1000000";
import { defineJob, enqueue, isStuck, queueJobs, reapJobs, reapSoon, resetReapClock, runJob, MAX_RUNS, type QueueJob } from "@/lib/create/platform/queue";
import { blobs } from "@/lib/create/platform/blob";
import { id, now } from "@/lib/create/platform/ids";
import { mediaJobs } from "@/lib/create/repo";
import { MEDIA_GAVE_UP, mediaTiming, publicMediaJob } from "@/lib/create/media";
import type { MediaJob } from "@/lib/create/types";
import { testWorkspace } from "./helpers/workspace";

const until = async (cond: () => Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out waiting");
};
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const stored = (over: Partial<QueueJob> & Pick<QueueJob, "workspaceId" | "name">): QueueJob => ({
  id: id("job"), payload: { workspaceId: over.workspaceId }, status: "queued", runs: 0, attempts: 0, maxAttempts: 3, leaseUntil: null,
  runAfter: ago(120_000), orphanAfter: ago(60_000), createdAt: ago(120_000), updatedAt: ago(120_000), ...over,
});

beforeEach(() => resetReapClock());

test("enqueue stores the job before it runs, runs it, and removes the row when done", async () => {
  const seen: unknown[] = [];
  defineJob("t.ok", async (p, ctx) => { seen.push({ p, run: ctx.run, resumed: ctx.resumed }); });
  const jobId = await enqueue("t.ok", { workspaceId: "wq1", x: 1 });
  assert.ok(jobId);
  // Stored synchronously with enqueue (the instance may die before the kick runs).
  const row = await queueJobs().get("wq1", jobId!);
  assert.ok(row && (row.status === "queued" || row.status === "running"));
  await until(async () => seen.length === 1 && !(await queueJobs().get("wq1", jobId!)));
  assert.deepEqual(seen[0], { p: { workspaceId: "wq1", x: 1 }, run: 1, resumed: false });
});

test("a job whose instance died (lease lapsed) is resumed by the reaper; a held lease is left alone", async () => {
  const runs: boolean[] = [];
  defineJob("t.resume", async (_p, ctx) => { runs.push(ctx.resumed); });
  const held = await queueJobs().insert(stored({ workspaceId: "wq2", name: "t.resume", status: "running", runs: 1, leaseUntil: new Date(Date.now() + 60_000).toISOString() }));
  const dead = await queueJobs().insert(stored({ workspaceId: "wq2", name: "t.resume", status: "running", runs: 1, leaseUntil: ago(1_000) }));
  const freshQueued = await queueJobs().insert(stored({ workspaceId: "wq2", name: "t.resume", orphanAfter: new Date(Date.now() + 30_000).toISOString() }));
  assert.equal(isStuck(held), false);
  assert.equal(isStuck(freshQueued), false, "its own kick is still due");
  const out = await reapJobs({ workspaceId: "wq2" });
  assert.deepEqual(out.map((o) => [o.id, o.outcome]), [[dead.id, "ran"]]);
  assert.deepEqual(runs, [true], "the resumed run knows it is a resume");
  assert.equal(await queueJobs().get("wq2", dead.id), null);
  assert.equal((await queueJobs().get("wq2", held.id))?.status, "running");
  assert.equal(await runJob("wq2", held.id), "busy");
});

test("two reapers racing on one stuck job start it once (per-run claim)", async () => {
  let n = 0;
  defineJob("t.race", async () => { n++; await new Promise((r) => setTimeout(r, 30)); });
  const j = await queueJobs().insert(stored({ workspaceId: "wq3", name: "t.race" }));
  const r = await Promise.all([runJob("wq3", j.id), runJob("wq3", j.id), runJob("wq3", j.id)]);
  assert.equal(n, 1);
  assert.equal(r.filter((x) => x === "ran").length, 1);
});

test("crashes count as attempts: after maxAttempts the job is failed and its give-up hook runs", async () => {
  const gaveUp: string[] = [];
  defineJob("t.dies", async () => { throw new Error("should not run"); }, { maxAttempts: 3, onGiveUp: async (p, err) => { gaveUp.push(`${p.workspaceId}:${err}`); } });
  const j = await queueJobs().insert(stored({ workspaceId: "wq4", name: "t.dies", status: "running", runs: 3, attempts: 2, leaseUntil: ago(5_000) }));
  assert.equal(await runJob("wq4", j.id), "gave_up");
  assert.equal((await queueJobs().get("wq4", j.id))?.status, "failed");
  assert.deepEqual(gaveUp, ["wq4:The job stopped before it finished."]);
  assert.equal(isStuck((await queueJobs().get("wq4", j.id))!), false, "a failed job is never reaped again");
  assert.deepEqual(await reapJobs({ workspaceId: "wq4" }), []);
});

test("a throwing handler is retried with backoff, then given up", async () => {
  let calls = 0;
  const gaveUp: string[] = [];
  defineJob("t.throws", async () => { calls++; throw new Error(`boom ${calls}`); }, { maxAttempts: 2, onGiveUp: async (_p, e) => { gaveUp.push(e); } });
  const j = await queueJobs().insert(stored({ workspaceId: "wq5", name: "t.throws", maxAttempts: 2 }));
  assert.equal(await runJob("wq5", j.id), "requeued");
  const row = (await queueJobs().get("wq5", j.id))!;
  assert.equal(row.status, "queued");
  assert.equal(row.attempts, 1);
  assert.ok(Date.parse(row.runAfter) > Date.now() + 10_000, "backs off");
  assert.equal(await runJob("wq5", j.id), "not_due");
  assert.equal(await runJob("wq5", j.id, Date.parse(row.runAfter) + 1), "failed");
  assert.deepEqual(gaveUp, ["boom 2"]);
});

test("a yield requeues without counting a failure, and the next reap continues it; runs are capped", async () => {
  let step = 0;
  defineJob("t.yield", async () => (++step < 3 ? { requeue: true as const, delayMs: 0 } : undefined));
  const j = await queueJobs().insert(stored({ workspaceId: "wq6", name: "t.yield" }));
  assert.equal(await runJob("wq6", j.id), "requeued");
  assert.equal((await queueJobs().get("wq6", j.id))?.attempts, 0);
  assert.deepEqual((await reapJobs({ workspaceId: "wq6", at: Date.now() + 1 })).map((o) => o.outcome), ["requeued"]);
  assert.deepEqual((await reapJobs({ workspaceId: "wq6", at: Date.now() + 1 })).map((o) => o.outcome), ["ran"]);
  assert.equal(step, 3);
  defineJob("t.forever", async () => ({ requeue: true as const }));
  const f = await queueJobs().insert(stored({ workspaceId: "wq6", name: "t.forever", runs: MAX_RUNS }));
  assert.equal(await runJob("wq6", f.id), "gave_up");
});

test("reapSoon runs at most every 10 s per workspace", async () => {
  let n = 0;
  defineJob("t.soon", async () => { n++; });
  await queueJobs().insert(stored({ workspaceId: "wq7", name: "t.soon" }));
  await queueJobs().insert(stored({ workspaceId: "wq7", name: "t.soon" }));
  reapSoon("wq7");
  reapSoon("wq7"); // throttled
  await until(async () => n === 2);
  await queueJobs().insert(stored({ workspaceId: "wq7", name: "t.soon" }));
  reapSoon("wq7");
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(n, 2, "the second call inside 10 s did nothing");
});

/* ── media.run: a video whose instance died resumes polling; it is never submitted twice ── */

test("media: a stuck video job resumes from its stored polling URL, completes, and is charged once", async () => {
  const ws = await testWorkspace("queue-media", "pro");
  const job: MediaJob = { id: id("med"), workspaceId: ws.id, kind: "video", prompt: "a fox in snow", model: "alibaba/wan-2.7", params: { aspectRatio: "16:9", durationSec: 5 }, status: "running", estimatedUnits: 1, units: null, outputKey: null, contentType: null, createdAt: now(), completedAt: null, pollUrl: "https://openrouter.ai/api/v1/videos/abc", submittedAt: now() };
  await mediaJobs().insert(job);
  await queueJobs().insert(stored({ workspaceId: ws.id, name: "media.run", payload: { workspaceId: ws.id, jobId: job.id, plan: "pro" }, status: "running", runs: 1, leaseUntil: ago(1_000) }));
  const real = globalThis.fetch;
  const hits: string[] = [];
  const pollMs = mediaTiming.pollMs;
  mediaTiming.pollMs = 1;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    hits.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "https://openrouter.ai/api/v1/videos/abc") return Response.json({ status: "completed", unsigned_urls: ["https://cdn.example.com/out.mp4"], usage: { cost: 0.25 } });
    if (url === "https://cdn.example.com/out.mp4") return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]));
    return real(input, init);
  }) as typeof fetch;
  try {
    const out = await reapJobs({ workspaceId: ws.id });
    assert.deepEqual(out.map((o) => o.outcome), ["ran"]);
  } finally {
    globalThis.fetch = real;
    mediaTiming.pollMs = pollMs;
    delete process.env.OPENROUTER_API_KEY;
  }
  assert.ok(!hits.some((h) => h.startsWith("POST")), `never submitted again: ${hits.join(", ")}`);
  const done = (await mediaJobs().get(ws.id, job.id))!;
  assert.equal(done.status, "completed");
  assert.ok((done.units ?? 0) > 0);
  assert.ok(await blobs().get(done.outputKey!));
  const shown = publicMediaJob(done) as Record<string, unknown>;
  assert.equal(shown.pollUrl, undefined, "the provider polling URL never reaches the browser");
  assert.equal(shown.url, `/api/create/blob/${done.outputKey}`);
});

test("media: a video that would outlive the run yields and is continued later (no resubmission)", async () => {
  const ws = await testWorkspace("queue-media-yield", "pro");
  const job: MediaJob = { id: id("med"), workspaceId: ws.id, kind: "video", prompt: "a fox in snow", model: "alibaba/wan-2.7", params: { aspectRatio: "16:9", durationSec: 5 }, status: "running", estimatedUnits: 1, units: null, outputKey: null, contentType: null, createdAt: now(), completedAt: null, pollUrl: "https://openrouter.ai/api/v1/videos/slow", submittedAt: now() };
  await mediaJobs().insert(job);
  const q = await queueJobs().insert(stored({ workspaceId: ws.id, name: "media.run", payload: { workspaceId: ws.id, jobId: job.id, plan: "pro" }, status: "running", runs: 1, leaseUntil: ago(1_000) }));
  // A deadline closer than the reserve a poll + download needs: the run yields straight away.
  assert.equal(await runJob(ws.id, q.id, Date.now(), Date.now() + 1_000), "requeued");
  assert.equal((await mediaJobs().get(ws.id, job.id))?.status, "running");
  const row = (await queueJobs().get(ws.id, q.id))!;
  assert.equal(row.status, "queued");
  assert.equal(row.attempts, 1, "only the crash before it counts; the yield does not");
});

test("media: after three dead runs the job is failed with an honest message and nothing is charged", async () => {
  const ws = await testWorkspace("queue-media-dead", "pro");
  const job: MediaJob = { id: id("med"), workspaceId: ws.id, kind: "image", prompt: "a fox", model: "openai/gpt-image-2", params: { aspectRatio: "1:1" }, status: "running", estimatedUnits: 1, units: null, outputKey: null, contentType: null, createdAt: now(), completedAt: null };
  await mediaJobs().insert(job);
  await queueJobs().insert(stored({ workspaceId: ws.id, name: "media.run", payload: { workspaceId: ws.id, jobId: job.id, plan: "pro" }, status: "running", runs: 3, attempts: 2, leaseUntil: ago(1_000) }));
  assert.deepEqual((await reapJobs({ workspaceId: ws.id })).map((o) => o.outcome), ["gave_up"]);
  const failed = (await mediaJobs().get(ws.id, job.id))!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, MEDIA_GAVE_UP);
  assert.equal(failed.units, null);
});
