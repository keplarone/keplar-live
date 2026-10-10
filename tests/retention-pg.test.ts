import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { collection } from "@/lib/create/platform/store";
import { pruneTelemetry } from "@/lib/ops/retention";

// Separate file: the store picks its backend per collection on first use, so Postgres must be configured before anything touches it.
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const DAY = 864e5;
const iso = (ago: number) => new Date(Date.now() - ago).toISOString();

test("retention on Postgres (PGlite): old telemetry rows are deleted in SQL, recent and unrelated rows stay", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  type R = { id: string; workspaceId: string; at?: string; m?: string; usd?: number; calls?: number };
  const calls = collection<R>("model_calls");
  await calls.insert({ id: "old1", workspaceId: "system", at: iso(20 * DAY) });
  await calls.insert({ id: "old2", workspaceId: "system", at: iso(15 * DAY) });
  await calls.insert({ id: "new1", workspaceId: "system", at: iso(2 * DAY) });
  await calls.insert({ id: "nofield", workspaceId: "system" });
  await collection<R>("system_spend_minute").insert({ id: "a", workspaceId: "system", m: iso(10 * DAY).slice(0, 16) });
  await collection<R>("system_spend_minute").insert({ id: "b", workspaceId: "system", m: iso(60_000).slice(0, 16) });
  const h = collection<R>("system_hourly_use");
  await h.insert({ id: `p:openrouter:${iso(9 * DAY).slice(0, 13)}`, workspaceId: "system", usd: 1, calls: 1 });
  await h.insert({ id: `m:some/model:${iso(0).slice(0, 13)}`, workspaceId: "system", usd: 1, calls: 1 });
  await collection<R>("keep_me").insert({ id: "k", workspaceId: "ws1", at: iso(400 * DAY) });

  assert.deepEqual(await pruneTelemetry(), { model_calls: 2, system_spend_minute: 1, system_hourly_use: 1 });
  const ids = async (n: string) => (await collection<R>(n).listSystem()).map((r) => r.id).sort();
  assert.deepEqual(await ids("model_calls"), ["new1", "nofield"]);
  assert.deepEqual(await ids("system_spend_minute"), ["b"]);
  assert.equal((await ids("system_hourly_use")).length, 1);
  assert.deepEqual(await ids("keep_me"), ["k"]);
  assert.deepEqual(await pruneTelemetry(), { model_calls: 0, system_spend_minute: 0, system_hourly_use: 0 });

  for (let i = 0; i < 5; i++) await calls.insert({ id: `b${i}`, workspaceId: "system", at: iso(30 * DAY) });
  assert.equal((await pruneTelemetry(Date.now(), 3)).model_calls, 3);
  assert.equal((await pruneTelemetry(Date.now(), 3)).model_calls, 2);
});
