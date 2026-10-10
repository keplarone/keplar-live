import "./setup";
// These tests spend whole allowances in one go to exercise windows and caps; the usage cooldown has its own tests.
process.env.KEPLAR_COOLDOWN_QUICK_FRACTION = "1000";
process.env.KEPLAR_COOLDOWN_PLUS_HOURLY_USD = "1000000";
process.env.KEPLAR_COOLDOWN_PRO_HOURLY_USD = "1000000";
process.env.KEPLAR_COOLDOWN_BUSINESS_HOURLY_USD = "1000000";
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatResetDay, formatResetIn, PLAN_ALLOWANCES, USAGE_WINDOWS, WINDOW_LIMITS, WINDOW_WARN_AT, windowResetText } from "@/lib/orchestration/plans";
import { assertCanSpend, chargeUnits, meter } from "@/lib/create/platform/compute";
import { recordWindowUsage, windowMeters, windowRoom } from "@/lib/create/platform/windows";
import { EntitlementError, ENTITLEMENTS } from "@/lib/create/platform/plans";
import { brand } from "@/lib/site";
import { createSettler } from "@/lib/orchestration/settle";
import type { Workspace } from "@/lib/create/platform/workspace";

const ws = (plan: "plus" | "pro" | "free" = "plus", over: Partial<Workspace> = {}): Workspace => ({
  id: `ws_${Math.random().toString(36).slice(2)}`, name: "T", plan, verified: true, entitlements: ENTITLEMENTS[plan], anonymous: false, admin: false,
  userId: "u", email: "u@example.com", period: { start: new Date(Date.now() - 864e5).toISOString(), end: new Date(Date.now() + 864e5 * 20).toISOString() }, ...over,
});

test("config: defaults live in one place; monthly credits unchanged", () => {
  assert.deepEqual(WINDOW_LIMITS.plus, { fiveHour: 1_000, weekly: 3_200 });
  assert.deepEqual(WINDOW_LIMITS.pro, { fiveHour: 2_250, weekly: 7_200 });
  assert.equal(PLAN_ALLOWANCES.plus.monthlyUnits, 6_000);
  assert.equal(PLAN_ALLOWANCES.pro.monthlyUnits, 13_500);
  assert.equal(USAGE_WINDOWS.fiveHour.ms, 18_000_000);
  assert.equal(USAGE_WINDOWS.weekly.ms, 604_800_000);
  assert.equal(WINDOW_WARN_AT, 0.8);
  assert.equal(WINDOW_LIMITS.free, undefined);
  assert.equal(WINDOW_LIMITS.business, undefined);
  assert.equal(brand.usage, "Keplar Usage");
});

test("reset text: 'resets in 3h 20m' and 'resets Mon'", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  assert.equal(formatResetIn(new Date(now + (3 * 60 + 20) * 60_000).toISOString(), now), "3h 20m");
  assert.equal(formatResetIn(new Date(now + 45 * 60_000).toISOString(), now), "45m");
  assert.equal(formatResetIn(new Date(now + 5 * 3600_000).toISOString(), now), "5h");
  assert.equal(formatResetIn(new Date(now + (50 * 60) * 60_000).toISOString(), now), "2d 2h");
  assert.equal(formatResetIn(new Date(now + 10_000).toISOString(), now), "under a minute");
  assert.equal(windowResetText("fiveHour", new Date(now + (3 * 60 + 20) * 60_000).toISOString(), now), "resets in 3h 20m");
  assert.match(windowResetText("weekly", "2026-10-05T16:00:00Z"), /^resets (Sun|Mon)$/);
  assert.equal(formatResetDay("2026-10-05T16:00:00Z"), "Mon");
});

test("windows: credits count in both windows; the 5-hour limit blocks with a reset time and a Pro suggestion for Plus", async () => {
  const w = ws("plus");
  assert.equal(await windowMeters(w).then((m) => m?.every((x) => x.used === 0 && x.resetsAt === null)), true);
  await chargeUnits(w, "answer", 900, 1.8);
  const m = (await windowMeters(w))!;
  assert.deepEqual(m.map((x) => [x.id, x.used, x.limit]), [["fiveHour", 900, 1000], ["weekly", 900, 3200]]);
  const end = new Date(m[0].resetsAt!).getTime();
  assert.ok(Math.abs(end - Date.now() - 5 * 3600_000) < 5_000);
  await assertCanSpend(w, 50);
  await assert.rejects(() => assertCanSpend(w, 200), (e: unknown) => {
    assert.ok(e instanceof EntitlementError);
    assert.match(e.message, /5-hour usage limit/);
    assert.match(e.message, /resets in 4h 5\dm|resets in 5h/i);
    assert.match(e.message, /Upgrade to Pro/);
    assert.equal(e.upgradeTo, "pro");
    return true;
  });
  const room = await windowRoom(w);
  assert.equal(room.remaining, 100);
  assert.equal(room.binding!.id, "fiveHour");
  const meterOut = await meter(w);
  assert.equal(meterOut.windows!.length, 2);
});


test("windows: an expired window resets to zero on the next charge", async () => {
  const w = ws("plus");
  const past = Date.now() - 6 * 3600_000;
  await recordWindowUsage(w, 800, past);
  assert.equal((await windowMeters(w))![0].used, 0, "5-hour window closed");
  assert.equal((await windowMeters(w))![1].used, 800, "weekly still open");
  await chargeUnits(w, "answer", 10, 0.02);
  const m = (await windowMeters(w))!;
  assert.equal(m[0].used, 10);
  assert.equal(m[1].used, 810);
});

test("windows: weekly limit blocks on its own with a reset day", async () => {
  const w = ws("plus");
  const t0 = Date.now() - 6 * 3600_000; // 5-hour window long closed
  await recordWindowUsage(w, 3_200, t0);
  const room = await windowRoom(w, 1);
  assert.equal(room.blocked?.id, "weekly");
  assert.match(room.blocked!.message, /weekly usage limit/);
  assert.match(room.blocked!.message, /\((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\)/);
});

test("windows: exempt for admin, Free and Business; admin keeps its own cap", async () => {
  for (const w of [ws("plus", { admin: true }), ws("free"), ws("pro", { admin: true })]) {
    assert.equal(await windowMeters(w), null);
    await recordWindowUsage(w, 1_000_000);
    const room = await windowRoom(w, 1_000_000);
    assert.equal(room.blocked, null);
    assert.equal(room.remaining, Infinity);
  }
  const biz = ws("plus");
  biz.plan = "business";
  assert.equal(await windowMeters(biz), null);
});

test("windows: failed / no-response runs are never charged, so they never count", async () => {
  const w = ws("plus");
  const settle = createSettler(w, { started: true, settled: false, plannedUnits: 40, noResponse: true });
  assert.equal(await settle(40), false);
  assert.deepEqual((await windowMeters(w))!.map((x) => x.used), [0, 0]);
  const ok = createSettler(w, { started: true, settled: false, plannedUnits: 40, responded: 3 });
  assert.equal(await ok(40), true);
  assert.deepEqual((await windowMeters(w))!.map((x) => x.used), [40, 40]);
});

test("windows: concurrent charges never lose an increment (atomic)", async () => {
  const w = ws("pro");
  await Promise.all(Array.from({ length: 10 }, () => chargeUnits(w, "answer", 10, 0.02)));
  assert.deepEqual((await windowMeters(w))!.map((x) => x.used), [100, 100]);
});

test("windows: racing first charges (a burst of 12, 150 times) never leave a lost increment on the live window", async () => {
  const { recordWindowUsage } = await import("@/lib/create/platform/windows");
  let bad = 0;
  for (let i = 0; i < 150; i++) {
    const w = ws("pro", { id: `ws_burst_${i}` });
    await Promise.all(Array.from({ length: 12 }, () => recordWindowUsage(w, 10)));
    if ((await windowMeters(w))!.some((x) => x.used !== 120)) bad++;
  }
  assert.equal(bad, 0, `${bad} of 150 bursts lost an increment`);
});
