import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { enterUsage, inflight, UsageLimitError, ANSWER_SLOT_TTL_MS } from "@/lib/create/platform/usage";
import { acquireJobSlotHandle, activeJobs, reservedJobUnits, setJobSlotUnits } from "@/lib/create/platform/jobs";
import { limitsFor } from "@/lib/orchestration/limits";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: `ws_${Math.random().toString(36).slice(2)}`, name: "T", plan: "plus", verified: true, entitlements: ENTITLEMENTS.plus, anonymous: false, admin: false,
  userId: "u", email: "u@example.com", period: { start: new Date(Date.now() - 864e5).toISOString(), end: new Date(Date.now() + 864e5 * 20).toISOString() }, ...over,
});
const req = (ip: string) => new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "x-forwarded-for": ip } });
const settle = <T>(ps: Promise<T>[]) => Promise.allSettled(ps);

test("concurrency: parallel requests on one instance can't all pass the check (the slot is claimed before any await)", async () => {
  const w = ws({ plan: "free", entitlements: ENTITLEMENTS.free, anonymous: true, userId: null, id: "anonymous" });
  const ip = "198.51.100.71";
  const max = limitsFor("free").concurrent;
  const out = await settle(Array.from({ length: max + 3 }, () => enterUsage(req(ip), w, { countsDaily: true })));
  const ok = out.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, max, "exactly the plan's concurrency passes");
  assert.ok(out.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof UsageLimitError));
  ok.forEach((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof enterUsage>>>).value.release());
  assert.equal(inflight(`ip:${ip}`).n, 0, "refused requests gave their claim back");
});

test("concurrency: a paid account's answers running on other instances count (shared slots)", async () => {
  const w = ws();
  const max = limitsFor("plus").concurrent;
  // Another instance is running `max` answers for this account.
  const elsewhere = await Promise.all(Array.from({ length: max }, () => acquireJobSlotHandle(w.id, "answer", max, ANSWER_SLOT_TTL_MS, "answer")));
  await assert.rejects(() => enterUsage(req("198.51.100.72"), w, { countsDaily: true }), (e: unknown) => e instanceof UsageLimitError && e.code === "concurrent");
  await elsewhere[0].release();
  const gate = await enterUsage(req("198.51.100.72"), w, { countsDaily: true });
  await setJobSlotUnits(w.id, elsewhere[1].id, 40);
  assert.equal(await gate.reservedElsewhere(), 40, "credits reserved by answers on other instances");
  gate.holdUnits(25);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(await reservedJobUnits(w.id, "answer", elsewhere[1].id), 25, "this answer's hold is visible to the others");
  gate.release();
  await new Promise((r) => setTimeout(r, 20));
  await Promise.all(elsewhere.slice(1).map((s) => s.release()));
  assert.equal(await activeJobs(w.id), 0, "every slot released");
});

test("job slots: an expired slot is taken over by exactly one of several concurrent callers", async () => {
  const id = `ws_${Math.random().toString(36).slice(2)}`;
  await acquireJobSlotHandle(id, "answer", 1, 1, "answer"); // expires after 1 ms (a crashed function)
  await new Promise((r) => setTimeout(r, 10));
  const out = await settle(Array.from({ length: 5 }, () => acquireJobSlotHandle(id, "answer", 1, 60_000, "answer")));
  assert.equal(out.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await activeJobs(id), 1, "the takeover marker never counts as a running job");
});
