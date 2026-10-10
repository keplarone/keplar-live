import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeploy, DeployStateError, isStale, kindFor, liveOf, PLAN, reduce, rollbackTargets, type Deploy, type DeployEvent } from "@/lib/deploy/machine";

const T = (s: number) => new Date(Date.UTC(2026, 9, 6, 12, 0, s)).toISOString();
const mk = (kind: "deploy" | "rollback" = "deploy", version = 3, id = "d1") => createDeploy({ id, workspaceId: "w", siteId: "s", kind, version, fromVersion: 2, by: "u", byName: "Ana", at: T(0) });
const run = (d: Deploy, evs: DeployEvent[]) => evs.reduce((acc, ev, i) => reduce(acc, ev, T(i + 1)), d);
const allOk = (kind: "deploy" | "rollback") => PLAN[kind].flatMap((step) => [{ type: "step-start", step }, { type: "log", step, text: `${step} done` }, { type: "step-end", step, state: "ok" }] as DeployEvent[]);

test("happy path: queued → running → every step in order with timestamped logs → live", () => {
  const d = run(mk(), [{ type: "start" }, ...allOk("deploy"), { type: "live", url: "https://keplar.one/s/x/" }]);
  assert.equal(d.status, "live");
  assert.equal(d.url, "https://keplar.one/s/x/");
  assert.ok(d.steps.every((s) => s.state === "ok" && s.startedAt && s.endedAt && s.lines.length === 1));
  assert.ok(d.steps[0].lines[0].at < d.steps[8].lines[0].at, "log lines carry increasing timestamps");
  assert.equal(d.steps.length, 9);
});

test("rollback takes the fast path (no re-scan, no critic) and still verifies the live render", () => {
  assert.deepEqual(PLAN.rollback, ["resolve", "validate", "snapshot", "promote", "purge", "verify", "domains"]);
  const d = run(mk("rollback", 1), [{ type: "start" }, ...allOk("rollback"), { type: "live", url: "u" }]);
  assert.equal(d.status, "live");
  assert.throws(() => reduce(mk("rollback"), { type: "step-start", step: "scan" }, T(1)), DeployStateError);
});

test("steps cannot run out of order, twice, or log while not running", () => {
  const started = reduce(mk(), { type: "start" }, T(1));
  assert.throws(() => reduce(started, { type: "step-start", step: "validate" }, T(2)), /not finished/);
  const r1 = reduce(started, { type: "step-start", step: "resolve" }, T(2));
  assert.throws(() => reduce(r1, { type: "step-start", step: "resolve" }, T(3)), /already running/);
  assert.throws(() => reduce(started, { type: "log", step: "resolve", text: "x" }, T(3)), /not running/);
  assert.throws(() => reduce(mk(), { type: "step-start", step: "resolve" }, T(1)), /not running/);
  assert.throws(() => reduce(started, { type: "start" }, T(2)), /only a queued/);
});

test("cannot go live before promote succeeded or with steps unfinished", () => {
  const partial = run(mk(), [{ type: "start" }, ...allOk("deploy").slice(0, 9)]);
  assert.throws(() => reduce(partial, { type: "live", url: "u" }, T(50)), /not finished/);
  const skippedPromote = run(mk(), [{ type: "start" }, ...PLAN.deploy.flatMap((step) => [{ type: "step-start", step }, { type: "step-end", step, state: step === "promote" ? "skipped" : "ok" }] as DeployEvent[])]);
  assert.throws(() => reduce(skippedPromote, { type: "live", url: "u" }, T(60)), /not promoted/);
});

test("failure marks the running step failed and skips the rest; a failed deploy is final", () => {
  const d = run(mk(), [{ type: "start" }, { type: "step-start", step: "resolve" }, { type: "step-end", step: "resolve", state: "ok" }, { type: "step-start", step: "validate" }, { type: "fail", error: "Sanitizer refused index.html" }]);
  assert.equal(d.status, "failed");
  assert.equal(d.steps[1].state, "failed");
  assert.ok(d.steps.slice(2).every((s) => s.state === "skipped"));
  assert.equal(d.error, "Sanitizer refused index.html");
  assert.throws(() => reduce(d, { type: "start" }, T(9)), DeployStateError);
  assert.throws(() => reduce(d, { type: "fail", error: "again" }, T(9)), /already finished/);
});

test("supersede only the live deploy; cancel only before promote", () => {
  const live = run(mk(), [{ type: "start" }, ...allOk("deploy"), { type: "live", url: "u" }]);
  assert.equal(reduce(live, { type: "supersede" }, T(99)).status, "superseded");
  assert.throws(() => reduce(mk(), { type: "supersede" }, T(1)), /only the live/);
  assert.equal(reduce(mk(), { type: "cancel" }, T(1)).status, "canceled");
  const promoting = run(mk(), [{ type: "start" }, ...allOk("deploy").slice(0, 15), { type: "step-start", step: "promote" }]);
  assert.throws(() => reduce(promoting, { type: "cancel" }, T(80)), /roll back instead/);
});

test("history: one live at a time, rollback eligibility, known-good versions, stale detection", () => {
  const a = { ...run(mk("deploy", 1, "a"), [{ type: "start" }, ...allOk("deploy"), { type: "live", url: "u" }]), status: "superseded" as const };
  const b = run(mk("deploy", 2, "b"), [{ type: "start" }, ...allOk("deploy"), { type: "live", url: "u" }]);
  const failed = run(mk("deploy", 3, "c"), [{ type: "start" }, { type: "fail", error: "x" }]);
  const hist = [a, b, failed];
  assert.equal(liveOf(hist)?.id, "b");
  assert.equal(kindFor(1, hist), "rollback", "v1 was live before → fast rollback");
  assert.equal(kindFor(3, hist), "deploy", "v3 only failed → full pipeline");
  const t = rollbackTargets([1, 2, 3, 4], hist, 2);
  assert.deepEqual(t.map((x) => [x.version, x.wasLive, x.current]), [[4, false, false], [3, false, false], [2, true, true], [1, true, false]]);
  const running = reduce(mk(), { type: "start" }, T(0));
  assert.ok(isStale(running, Date.parse(T(0)) + 200_000));
  assert.ok(!isStale(running, Date.parse(T(0)) + 60_000));
  assert.ok(!isStale(b, Date.parse(T(0)) + 999_999));
});
