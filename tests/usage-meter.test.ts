import { test } from "node:test";
import assert from "node:assert/strict";
import { percentLeft, usageMeter, type MeterInput } from "../src/lib/usage/meter";
import { dailyLeftText } from "../src/lib/usage/format";

const base: MeterInput = { plan: "free", used: 0, total: null, daily: null, synced: true, signedIn: true };

test("Free: percent left is the same daily count as 'N of M left' (23 of 50 = 46%)", () => {
  const m = usageMeter({ ...base, daily: { left: 23, limit: 50 } });
  assert.deepEqual(m, { kind: "daily", left: 23, limit: 50, pct: 46 });
  assert.equal(dailyLeftText({ left: 23, limit: 50 }), "23 of 50 left");
});

test("Free never reads the (absent) monthly credit allowance: no fake 100%", () => {
  // total is null for Free; the old code treated that as infinite and showed 100% left.
  assert.notEqual((usageMeter({ ...base, total: null, used: 27, daily: { left: 23, limit: 50 } }) as { pct: number }).pct, 100);
  assert.equal((usageMeter({ ...base, daily: { left: 50, limit: 50 } }) as { pct: number }).pct, 100); // 100 only when really all left
  assert.equal((usageMeter({ ...base, daily: { left: 0, limit: 50 } }) as { pct: number }).pct, 0);
  assert.equal((usageMeter({ ...base, daily: { left: 1, limit: 50 } }) as { pct: number }).pct, 2);
  assert.equal((usageMeter({ ...base, daily: { left: 1, limit: 500 } }) as { pct: number }).pct, 1); // never 0% while something is left
});

test("Free with the daily count not loaded is unknown, not 100%", () => {
  assert.deepEqual(usageMeter({ ...base, daily: null }), { kind: "unknown" });
  assert.deepEqual(usageMeter({ ...base, daily: { left: NaN, limit: 50 } }), { kind: "unknown" });
  assert.deepEqual(usageMeter({ ...base, daily: { left: 5, limit: 0 } }), { kind: "unknown" });
});

test("not synced or signed out is unknown", () => {
  assert.deepEqual(usageMeter({ ...base, synced: false, daily: { left: 23, limit: 50 } }), { kind: "unknown" });
  assert.deepEqual(usageMeter({ ...base, signedIn: false, daily: { left: 23, limit: 50 } }), { kind: "unknown" });
});

test("paid plans: credits left over the period allowance", () => {
  assert.deepEqual(usageMeter({ ...base, plan: "plus", total: 1000, used: 250 }), { kind: "credits", left: 750, total: 1000, pct: 75 });
  assert.equal((usageMeter({ ...base, plan: "pro", total: 1000, used: 999 }) as { pct: number }).pct, 1);
  assert.equal((usageMeter({ ...base, plan: "pro", total: 1000, used: 1000 }) as { pct: number }).pct, 0);
  assert.equal((usageMeter({ ...base, plan: "pro", total: 1000, used: 5000 }) as { left: number }).left, 0); // overshoot clamps
  assert.equal((usageMeter({ ...base, plan: "plus", total: 1000, used: 0 }) as { pct: number }).pct, 100);
});

test("admin and custom contracts are unlimited: no percentage", () => {
  assert.deepEqual(usageMeter({ ...base, plan: "pro", total: null, admin: true }), { kind: "unlimited", reason: "admin" });
  assert.deepEqual(usageMeter({ ...base, plan: "business", total: null }), { kind: "unlimited", reason: "custom" });
  assert.deepEqual(usageMeter({ ...base, plan: "free", admin: true, daily: null }), { kind: "unlimited", reason: "admin" });
});

test("percentLeft edge cases", () => {
  assert.equal(percentLeft(23, 50), 46);
  assert.equal(percentLeft(60, 50), 100);
  assert.equal(percentLeft(-3, 50), 0);
  assert.equal(percentLeft(5, 0), 0);
  assert.equal(percentLeft(Infinity, Infinity), 0);
});

// The card is driven by the app state, so check the real reducer path too: loading -> synced -> a question is asked -> server confirms.
import { initialState, reducer } from "../src/components/app-ui/state/store";
import type { Ledger } from "../src/components/app-ui/state/types";

const ledger = (p: Partial<Ledger>): Omit<Ledger, "synced"> => ({ used: 0, total: null, plan: "free", resetsAt: null, paused: false, signedIn: true, windows: null, daily: null, ...p });
const daily = (left: number) => ({ used: 50 - left, limit: 50, left, resetsAt: "2026-10-05T00:00:00.000Z" });

test("loading: before the first /api/compute answer the card has nothing to show", () => {
  assert.deepEqual(usageMeter(initialState().ledger), { kind: "unknown" });
});

test("Free through the reducer: 23 of 50 -> 46%, drops with each 'daily' event, refunds when the server gives it back", () => {
  let st = reducer(initialState(), { type: "ledger", ledger: ledger({ daily: daily(23) }) });
  assert.deepEqual(usageMeter(st.ledger), { kind: "daily", left: 23, limit: 50, pct: 46 });
  const send = (left: number) => { st = reducer(st, { type: "event", threadId: "t", keplarId: "k", event: { type: "daily", daily: daily(left) } }); return usageMeter(st.ledger); };
  assert.deepEqual(send(22), { kind: "daily", left: 22, limit: 50, pct: 44 });
  assert.deepEqual(send(21), { kind: "daily", left: 21, limit: 50, pct: 42 });
  assert.deepEqual(send(22), { kind: "daily", left: 22, limit: 50, pct: 44 }); // given back: no answer came
  assert.equal(usageMeter(reducer(st, { type: "event", threadId: "t", keplarId: "k", event: { type: "daily", daily: daily(0) } }).ledger).kind, "daily");
});

test("Plus, Pro and admin through the reducer", () => {
  const m = (p: Partial<Ledger>) => usageMeter(reducer(initialState(), { type: "ledger", ledger: ledger(p) }).ledger);
  assert.deepEqual(m({ plan: "plus", total: 2000, used: 500 }), { kind: "credits", left: 1500, total: 2000, pct: 75 });
  assert.deepEqual(m({ plan: "pro", total: 10000, used: 9990 }), { kind: "credits", left: 10, total: 10000, pct: 1 });
  assert.deepEqual(m({ plan: "business", total: null, admin: true }), { kind: "unlimited", reason: "admin" }); // the admin account: "Unlimited", never a fake 100%
  assert.deepEqual(m({ plan: "free", total: null, daily: null }), { kind: "unknown" });
});
