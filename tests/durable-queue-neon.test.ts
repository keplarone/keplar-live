import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { defineJob, enqueue, queueJobs, reapJobs, runJob, type QueueJob } from "@/lib/create/platform/queue";

// REL-1 against Postgres semantics (PGlite behind a fake Neon endpoint): the per-run claim is the primary key, so racing reapers start a run once.
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon("ep-queue.us-east-2.aws.neon.tech");
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());
const skip = "@electric-sql/pglite is not installed";
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

test("postgres: a stored job survives its instance and is resumed exactly once by racing reapers", async (t) => {
  if (!fake) return t.skip(skip);
  let runs = 0;
  defineJob("pg.job", async (_p, ctx) => { runs++; assert.equal(ctx.resumed, true); await new Promise((r) => setTimeout(r, 20)); });
  const dead: QueueJob = { id: "job_pg_dead", workspaceId: "w_pg", name: "pg.job", payload: { workspaceId: "w_pg" }, status: "running", runs: 1, attempts: 0, maxAttempts: 3, leaseUntil: ago(1000), runAfter: ago(60_000), orphanAfter: ago(1000), createdAt: ago(60_000), updatedAt: ago(1000) };
  await queueJobs().insert(dead);
  const out = await Promise.all([reapJobs({ workspaceId: "w_pg" }), reapJobs({ workspaceId: "w_pg" }), runJob("w_pg", dead.id)]);
  assert.equal(runs, 1, JSON.stringify(out));
  assert.equal(await queueJobs().get("w_pg", dead.id), null);
});

test("postgres: enqueue writes the row, then runs it", async (t) => {
  if (!fake) return t.skip(skip);
  let ran = false;
  defineJob("pg.enqueue", async () => { ran = true; });
  const jobId = await enqueue("pg.enqueue", { workspaceId: "w_pg2" });
  const end = Date.now() + 3000;
  while (!(ran && !(await queueJobs().get("w_pg2", jobId!))) && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  assert.equal(ran, true);
  assert.equal(await queueJobs().get("w_pg2", jobId!), null);
});
