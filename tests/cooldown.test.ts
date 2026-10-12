import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { activeCooldown, assertNotCoolingDown, clearCooldown, CooldownError, cooldownConfig, evaluateCooldown, velocity } from "@/lib/create/platform/cooldown";
import { assertCanSpend, charge, chargeUnits, meter } from "@/lib/create/platform/compute";
import { breakerLevel, levelFor, paidMediaPaused, useCheaperModels } from "@/lib/create/platform/breaker";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { enterUsage, UsageLimitError } from "@/lib/create/platform/usage";
import { recordSpend, spendToday } from "@/lib/create/platform/spend";
import { acquireJobSlot, activeJobs } from "@/lib/create/platform/jobs";
import { modelChain, estimateJob, MODELS, creditsFor } from "@/lib/site-builder/limits";
import type { Workspace } from "@/lib/create/platform/workspace";

// The spend-spike detector (src/lib/ops/telemetry.ts, tested in ops.test.ts) checks at most every 10 s. Under a loaded parallel run this
// file outlives that window, the second check sees the test spend so far and auto-pauses media ("media_paused" in the breaker test).
process.env.KEPLAR_SPIKE_USD = "1000000";
import { errorResponse } from "@/lib/create/platform/http";

const ws = (plan: "plus" | "pro" | "free" | "business" = "plus", over: Partial<Workspace> = {}): Workspace => ({
  id: `ws_${Math.random().toString(36).slice(2)}`, name: "T", plan, verified: true, entitlements: ENTITLEMENTS[plan], anonymous: false, admin: false,
  userId: "u", email: "u@example.com", period: { start: new Date(Date.now() - 864e5).toISOString(), end: new Date(Date.now() + 864e5 * 20).toISOString() }, ...over,
});
const usd = (n: number) => Math.ceil(n / 0.002);

test("defaults: Plus $2/h, Pro $4/h, 60% of the daily cap, 30/45/60 minutes", () => {
  const c = cooldownConfig();
  assert.equal(c.hourlyUsd.plus, 2);
  assert.equal(c.hourlyUsd.pro, 4);
  assert.equal(c.quickFraction, 0.6);
  assert.deepEqual(c.durationsMin, [30, 45, 60]);
});

test("every spend path feeds the same velocity: answers (chargeUnits), Create (charge), tools (chargeUnits)", async () => {
  const w = ws("plus");
  await chargeUnits(w, "answer", usd(0.6), 0.6);
  await chargeUnits(w, "slides", usd(0.4), 0.4);
  await charge(w, "site.build", { usd: 0.5 });
  const v = await velocity(w);
  assert.ok(Math.abs(v.hourUsd - 1.5) < 0.01, String(v.hourUsd));
  assert.equal(await activeCooldown(w), null);
  await assertCanSpend(w, 10);
});

test("over $2/hour on Plus starts a 30 minute cooldown; spending is refused with the reset time", async () => {
  const w = ws("plus");
  await chargeUnits(w, "answer", usd(1.2), 1.2);
  await chargeUnits(w, "answer", usd(0.9), 0.9);
  const c = await activeCooldown(w);
  assert.ok(c, "cooldown active");
  assert.equal(c!.strikes, 1);
  assert.ok(Math.abs(c!.remainingMs - 30 * 60_000) < 5_000);
  assert.match(c!.message, /^Keplar usage cooldown:/);
  assert.match(c!.message, /30m|29m/);
  assert.match(c!.message, /until \d\d:\d\d UTC/);
  await assert.rejects(() => assertCanSpend(w, 1), (e) => e instanceof CooldownError && e.status === 429 && e.code === "cooldown");
  await assert.rejects(() => assertNotCoolingDown(w), CooldownError);
  const res = errorResponse(await assertNotCoolingDown(w).catch((e) => e));
  assert.equal(res.status, 429);
  const j = (await res.json()) as { code: string; until: string };
  assert.equal(j.code, "cooldown");
  assert.equal(j.until, c!.until);
  // /app question path: enterUsage refuses before counting anything.
  const req = new Request("https://keplar.one/api/keplar", { headers: { "x-forwarded-for": "1.2.3.4" } });
  await assert.rejects(() => enterUsage(req, w, { countsDaily: true }), (e) => e instanceof UsageLimitError && e.code === "cooldown" && /cooldown/.test(e.message));
  const m = await meter(w);
  assert.equal(m.cooldown?.until, c!.until);
});

test("Pro limit is $4/hour; the 60%-of-daily-cap-in-30-minutes rule trips Plus earlier than the hourly one", async () => {
  const pro = ws("pro");
  await chargeUnits(pro, "answer", usd(3.5), 3.5);
  assert.equal(await activeCooldown(pro), null);
  await chargeUnits(pro, "answer", usd(0.8), 0.8);
  assert.ok(await activeCooldown(pro));
  // Plus daily cap is $3 -> 60% = $1.80 inside 30 minutes, below the $2/hour line.
  const plus = ws("plus");
  await chargeUnits(plus, "answer", usd(1.9), 1.9);
  const c = await activeCooldown(plus);
  assert.ok(c);
  assert.equal(c!.reason, "quick");
});

test("repeats escalate 30 -> 45 -> 60 minutes (and stay at 60); spend before a cooldown does not retrigger it", async () => {
  const w = ws("plus");
  const trip = async () => {
    await chargeUnits(w, "answer", usd(2.2), 2.2);
    return activeCooldown(w);
  };
  const c1 = await trip();
  assert.equal(c1!.strikes, 1);
  // Pretend the cooldown ended (rewrite its end time to the past), keeping the strike memory.
  const { collection } = await import("@/lib/create/platform/store");
  const rows = collection<{ id: string; workspaceId: string; until: string; startedAt: string }>("usage_cooldown");
  const end = async () => rows.update(w.id, "state", { until: new Date(Date.now() - 1000).toISOString() });
  await end();
  assert.equal(await activeCooldown(w), null);
  // The earlier spend is before the cooldown start, so a small new charge does not retrigger.
  await chargeUnits(w, "answer", usd(0.1), 0.1);
  assert.equal(await activeCooldown(w), null);
  const c2 = await trip();
  assert.equal(c2!.strikes, 2);
  assert.ok(Math.abs(c2!.remainingMs - 45 * 60_000) < 5_000);
  await end();
  const c3 = await trip();
  assert.equal(c3!.strikes, 3);
  assert.ok(Math.abs(c3!.remainingMs - 60 * 60_000) < 5_000);
  await end();
  const c4 = await trip();
  assert.equal(c4!.strikes, 4);
  assert.ok(Math.abs(c4!.remainingMs - 60 * 60_000) < 5_000);
  await clearCooldown(w.id);
  assert.equal(await activeCooldown(w), null);
});

test("admin (team@keplar.one) and Free are exempt from cooldown, and the daily safety cap does not stop the admin", async () => {
  const admin = ws("business", { admin: true, email: "team@keplar.one", entitlements: { ...ENTITLEMENTS.business, monthlyUnits: Infinity } });
  await chargeUnits(admin, "answer", usd(10), 10);
  assert.equal(await evaluateCooldown(admin), null);
  assert.equal(await activeCooldown(admin), null);
  await assertCanSpend(admin, 5);
  await chargeUnits(admin, "answer", usd(16), 16);
  // The daily safety cap is recorded and does not stop chat, Create, or Studio.
  await assertCanSpend(admin, 5);
  await assertCanSpend(admin, 5, { kind: "agent", dailySafetyCap: false });
  // Credits still apply: a paid account with too few credits is refused.
  const short = ws("plus", { entitlements: { ...ENTITLEMENTS.plus, monthlyUnits: 10 } });
  await assert.rejects(() => assertCanSpend(short, 50, { kind: "agent", dailySafetyCap: false }), /credits/);
  const free = ws("free");
  await chargeUnits(free, "answer", usd(50), 50);
  assert.equal(await activeCooldown(free), null);
});

test("global circuit breaker: lighter models from 70%; image and video keep running", async () => {
  assert.equal(levelFor(10, 25), "normal");
  assert.equal(levelFor(17.5, 25), "cheap");
  assert.equal(levelFor(21.25, 25), "no_media");
  assert.equal(levelFor(25, 25), "capped");
  assert.equal(useCheaperModels("cheap"), true);
  assert.equal(paidMediaPaused("cheap"), false);
  assert.equal(paidMediaPaused("no_media"), false);
  assert.equal(paidMediaPaused("capped"), false);
  assert.equal(modelChain("pro", "normal")[0].id, MODELS.pro.id);
  assert.equal(modelChain("pro", "cheap")[0].id, MODELS.cheap.id);
  assert.equal(modelChain("plus", "cheap")[0].id, MODELS.cheap.id);
  assert.ok(modelChain("free", "capped").every((m) => m.free));
  const base = await breakerLevel();
  assert.equal(base === "normal" || base === "cheap" || base === "no_media" || base === "capped", true);
  // Real spend counter: past 85% and at the cap, image and video credits are still allowed.
  const day = new Date().toISOString().slice(0, 10);
  void day;
  await recordSpend(1, "plus");
  const total = (await spendToday()).totalUsd;
  process.env.KEPLAR_GLOBAL_DAILY_USD_CAP = String(total / 0.9);
  assert.equal(await breakerLevel(), "no_media");
  process.env.KEPLAR_GLOBAL_DAILY_USD_CAP = String(total / 0.75);
  assert.equal(await breakerLevel(), "cheap");
  process.env.KEPLAR_GLOBAL_DAILY_USD_CAP = String(Math.max(total, 0.01));
  assert.equal(await breakerLevel(), "capped");
  const w = ws("pro");
  await assertCanSpend(w, 10, { paidMedia: true });
  await assertCanSpend(w, 10);
});

test("job slots: per-user concurrency across instances, released and expired slots free up", async () => {
  const id = `ws_${Math.random().toString(36).slice(2)}`;
  const a = await acquireJobSlot(id, "site", 2);
  const b = await acquireJobSlot(id, "site", 2);
  assert.equal(await activeJobs(id), 2);
  await assert.rejects(() => acquireJobSlot(id, "site", 2), /already have 2 builds running/);
  await a();
  const c = await acquireJobSlot(id, "site", 2);
  await b();
  await c();
  assert.equal(await activeJobs(id), 0);
  const stale = await acquireJobSlot(id, "site", 1, -1000); // expired the moment it was taken (crashed function)
  void stale;
  const again = await acquireJobSlot(id, "site", 1);
  await again();
});

test("estimates: Free is $0; paid costs scale with the model and the site; ranges bracket the estimate", () => {
  const free = estimateJob({ plan: "free", promptChars: 400, siteChars: 0, hasSite: false });
  assert.equal(free.units, 0);
  assert.equal(free.free, true);
  const plus = estimateJob({ plan: "plus", promptChars: 400, siteChars: 0, hasSite: false });
  const pro = estimateJob({ plan: "pro", promptChars: 400, siteChars: 0, hasSite: false });
  assert.ok(plus.units > 10 && plus.units < 120, String(plus.units));
  assert.ok(pro.units > plus.units);
  assert.ok(plus.low < plus.units && plus.units <= plus.high);
  const bigEdit = estimateJob({ plan: "pro", promptChars: 600, siteChars: 250_000, hasSite: true });
  assert.ok(bigEdit.units > 120, `big edit asks for confirmation: ${bigEdit.units}`);
  assert.equal(creditsFor(0.05), Math.ceil((0.05 * 1.1) / 0.002));
});
