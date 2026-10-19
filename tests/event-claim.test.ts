import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { collection } from "@/lib/create/platform/store";
import { claimEvent, finishEvent, PROCESSING, releaseEvent, STALE_MS, type ClaimRow } from "@/lib/billing/event-claim";

const col = () => collection<ClaimRow>(`claim_test_${Math.random().toString(36).slice(2)}`);

test("claim: of many concurrent copies of one event, exactly one is claimed; the rest see it as a duplicate", async () => {
  const c = col();
  const out = await Promise.all(Array.from({ length: 8 }, () => claimEvent(c, { id: "evt_1", workspaceId: "system", type: "t" })));
  assert.equal(out.filter((x) => x.claimed).length, 1);
  await finishEvent(c, "system", "evt_1", "plan=plus");
  const again = await claimEvent(c, { id: "evt_1", workspaceId: "system", type: "t" });
  assert.deepEqual(again, { claimed: false, result: "plan=plus" }, "a finished event returns its result");
});

test("claim: a released claim (failed handler) is processed by the retry", async () => {
  const c = col();
  assert.ok((await claimEvent(c, { id: "e", workspaceId: "system", type: "t" })).claimed);
  await releaseEvent(c, "system", "e");
  assert.ok((await claimEvent(c, { id: "e", workspaceId: "system", type: "t" })).claimed);
});

test("claim: a stale 'processing' claim is taken over by exactly one of several concurrent retries; a fresh one is not", async () => {
  const c = col();
  const t0 = new Date("2026-10-19T10:00:00.000Z");
  assert.ok((await claimEvent(c, { id: "s", workspaceId: "system", type: "t" }, t0.toISOString())).claimed);
  const soon = new Date(t0.getTime() + 1000).toISOString();
  assert.deepEqual(await claimEvent(c, { id: "s", workspaceId: "system", type: "t" }, soon), { claimed: false, result: PROCESSING });
  const later = new Date(t0.getTime() + STALE_MS + 1000).toISOString();
  const out = await Promise.all(Array.from({ length: 6 }, () => claimEvent(c, { id: "s", workspaceId: "system", type: "t" }, later)));
  assert.equal(out.filter((x) => x.claimed).length, 1, "only one retry takes over the stale claim");
});

test("claim: after a release and a new claim, a later stale takeover still works", async () => {
  const c = col();
  const at = (ms: number) => new Date(Date.parse("2026-10-19T10:00:00.000Z") + ms).toISOString();
  const r = { id: "x", workspaceId: "system", type: "t" };
  assert.ok((await claimEvent(c, r, at(0))).claimed);
  assert.ok((await claimEvent(c, r, at(STALE_MS + 1)).then((x) => x.claimed)), "first takeover");
  await releaseEvent(c, "system", "x");
  assert.ok((await claimEvent(c, r, at(STALE_MS + 2))).claimed, "a new claim after the release");
  assert.ok((await claimEvent(c, r, at(3 * STALE_MS))).claimed, "and its stale claim can be taken over again");
});
