import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptDpr, createLane, laneSummary, agreementLayout, agreementSummary, budget, resolveQuality, startDpr, SURFACE_INTENSITY, type Caps } from "../src/lib/spatial/policy";

const desk: Caps = { webgl: true, reducedMotion: false, mobile: false, devicePixelRatio: 2, deviceMemoryGb: 8, cores: 8 };

test("admin and settings never get a scene; create is the most immersive", () => {
  assert.equal(SURFACE_INTENSITY.admin, "none");
  assert.equal(SURFACE_INTENSITY.settings, "none");
  assert.equal(SURFACE_INTENSITY.create, "immersive");
  assert.equal(resolveQuality(SURFACE_INTENSITY.admin, desk), "off");
});

test("fallbacks: no WebGL = off, reduced motion / data saver / weak device = static", () => {
  assert.equal(resolveQuality("rich", { ...desk, webgl: false }), "off");
  assert.equal(resolveQuality("rich", { ...desk, reducedMotion: true }), "static");
  assert.equal(resolveQuality("rich", { ...desk, saveData: true }), "static");
  assert.equal(resolveQuality("rich", { ...desk, deviceMemoryGb: 2 }), "static");
  assert.equal(resolveQuality("immersive", desk), "high");
  assert.equal(resolveQuality("immersive", { ...desk, mobile: true }), "medium");
  assert.equal(resolveQuality("subtle", { ...desk, mobile: true }), "low");
});

test("DPR starts capped by tier and adapts to frame time within bounds", () => {
  assert.equal(startDpr("low", 3), 1);
  assert.equal(startDpr("high", 3), 2);
  assert.equal(adaptDpr(2, 40, 2), 1.75);
  let d = 2;
  for (let i = 0; i < 20; i++) d = adaptDpr(d, 50, 2);
  assert.equal(d, 0.75);
  assert.equal(adaptDpr(1, 8, 2), 1.1);
  assert.equal(adaptDpr(2, 8, 2), 2);
  assert.equal(adaptDpr(1.5, 16, 2), 1.5);
  assert.equal(budget("off", 1000), 0);
  assert.ok(budget("low", 1000) < budget("high", 1000));
});

test("agreement layout only reflects real stances; failures are missing, never dissent", () => {
  const nodes = agreementLayout({
    level: "partial",
    models: [
      { id: "a", status: "responded", stance: "rent" },
      { id: "b", status: "responded", stance: "rent" },
      { id: "c", status: "responded", stance: "buy" },
      { id: "d", status: "failed" },
      { id: "e", status: "not-needed" },
    ],
  });
  const g = (id: string) => nodes.find((n) => n.id === id)?.group;
  assert.equal(g("a"), "majority");
  assert.equal(g("b"), "majority");
  assert.equal(g("c"), "dissent");
  assert.equal(g("d"), "missing");
  assert.equal(g("e"), undefined);
  assert.equal(agreementSummary(nodes), "2 agreed, 1 dissented, 1 did not respond");
});

test("no invented agreement: unscored, single, or <2 consulted", () => {
  const unscored = agreementLayout({ level: "unscored", models: [{ id: "a", status: "responded", stance: "x" }, { id: "b", status: "responded", stance: "x" }] });
  assert.ok(unscored.every((n) => n.group === "unscored"));
  assert.deepEqual(agreementLayout({ level: "single", models: [{ id: "a", status: "responded" }] }), []);
  assert.deepEqual(agreementLayout({ level: "consensus", models: [{ id: "a", status: "responded", stance: "x" }, { id: "b", status: "not-needed" }] }), []);
});

import { activationState, activationSummary } from "../src/lib/spatial/policy";

test("activation scene shows nothing until the stream says several models were asked, and only real arrivals light up", () => {
  assert.equal(activationState({ count: 0, ticks: [], stage: "understand" }), null);
  assert.equal(activationState({ count: 1, ticks: [], stage: "select" }), null);
  const s = activationState({ count: 4, ticks: ["responded", "failed"], stage: "select" })!;
  assert.deepEqual(s.nodes.map((n) => n.state), ["responded", "missing", "pending", "pending"]);
  assert.equal(s.converge, 0);
  assert.equal(activationState({ count: 3, ticks: ["responded"], stage: "compare" })!.converge, 0.5);
  assert.equal(activationState({ count: 3, ticks: ["responded", "responded", "responded"], stage: "synthesize" })!.converge, 1);
  assert.equal(activationSummary({ count: 4, ticks: ["responded", "failed"], stage: "select" }), "2 of 4 models have answered");
});

import { memoryLayout, nearestNode, projectTimeline } from "../src/lib/spatial/policy";
import { approvalFlow } from "../src/lib/business/flow";

test("memory constellation: one node per record, stable, grouped by kind, older further out", () => {
  const items = [
    { id: "m1", kind: "name", source: "user" as const, createdAt: "2026-01-01T00:00:00Z" },
    { id: "m2", kind: "goal", source: "auto" as const, createdAt: "2026-03-01T00:00:00Z" },
    { id: "m3", kind: "goal", source: "auto" as const, createdAt: "2026-06-01T00:00:00Z" },
  ];
  const a = memoryLayout(items);
  assert.equal(a.length, 3);
  assert.deepEqual(a, memoryLayout(items), "deterministic");
  const r = (id: string) => { const n = a.find((x) => x.id === id)!; return Math.hypot(n.x / 1.5, n.y); };
  assert.ok(r("m1") > r("m2") && r("m2") > r("m3"), "older = further out");
  assert.deepEqual(memoryLayout([]), []);
  assert.equal(nearestNode(a, a[0].x + 0.01, a[0].y, 0.05)?.id, "m1");
  assert.equal(nearestNode(a, 5, 5), null);
});

test("projects timeline: positions are linear in real time; unfiled threads get their own lane; too little data = none", () => {
  assert.equal(projectTimeline([], []), null);
  const tl = projectTimeline(
    [{ id: "p1", name: "Trip", createdAt: 0 }],
    [
      { id: "t1", title: "Flights", projectId: "p1", createdAt: 500 },
      { id: "t2", title: "Misc", projectId: null, createdAt: 1000 },
    ],
  )!;
  assert.equal(tl.lanes.length, 2);
  assert.equal(tl.lanes[0].items[0].pos, 0.5);
  assert.equal(tl.lanes[1].name, "No project");
  assert.equal(tl.lanes[1].items[0].pos, 1);
});

test("approval flow reads only real fields and never auto-grants permission", () => {
  const base = { action: { type: "email.send" } };
  const pending = approvalFlow({ action: base.action, status: "pending", risk: "high", riskReasons: ["unknown recipient"], runUsd: 0.0123 });
  assert.deepEqual(pending.map((s) => s.id), ["action", "risk", "cost", "permission", "outcome"]);
  assert.equal(pending[1].tone, "destructive");
  assert.match(pending[2].detail, /\$0\.012/);
  assert.equal(pending[3].tone, "attention");
  assert.equal(pending[4].reached, false);
  const sent = approvalFlow({ action: base.action, status: "sent" });
  assert.equal(sent[1].detail.startsWith("Not rated"), true);
  assert.equal(sent[3].tone, "verified");
  assert.equal(sent[4].reached, true);
  const rejected = approvalFlow({ action: base.action, status: "rejected", risk: "low" });
  assert.equal(rejected[3].tone, "destructive");
});

const lane0 = { pages: ["index.html", "about.html", "contact.html"], written: [] as string[], saving: false, busy: false, failed: false, published: false, ahead: false };

test("create lane: one node per real page, nothing when there are none", () => {
  assert.equal(createLane({ ...lane0, pages: [] }).nodes.length, 0);
  const l = createLane(lane0);
  assert.deepEqual(l.nodes.map((n) => n.id), lane0.pages);
  assert.ok(l.nodes.every((n) => n.state === "ready"));
  assert.equal(l.boundary, "passed");
  assert.equal(l.flow, false);
});

test("create lane: nodes light only when the build really reports writing them", () => {
  const l = createLane({ ...lane0, busy: true, written: ["index.html"] });
  assert.deepEqual(l.nodes.map((n) => n.state), ["written", "waiting", "waiting"]);
  assert.equal(l.flow, true);
  assert.equal(l.boundary, "none");
  assert.equal(createLane({ ...lane0, busy: true, written: ["index.html"], saving: true }).boundary, "checking");
  // A file the build wrote that is not yet a page still gets its own node.
  assert.equal(createLane({ ...lane0, busy: true, written: ["new.html"] }).nodes.length, 4);
  assert.match(laneSummary({ ...lane0, busy: true, written: ["index.html"] }), /1 of 3 pages written/);
});

test("create lane: finished states are live (green), live with changes (amber) or failed (coral), never invented", () => {
  assert.ok(createLane({ ...lane0, published: true }).nodes.every((n) => n.state === "live"));
  assert.ok(createLane({ ...lane0, published: true, ahead: true }).nodes.every((n) => n.state === "ahead"));
  const f = createLane({ ...lane0, failed: true, written: ["index.html"] });
  assert.deepEqual(f.nodes.map((n) => n.state), ["written", "failed", "failed"]);
  assert.equal(f.boundary, "none");
  assert.match(laneSummary({ ...lane0, failed: true, written: ["index.html"] }), /did not finish/);
});

import { adaptDensity } from "../src/lib/spatial/policy";
test("particle density sheds under slow frames, never below 30%, and recovers with headroom", () => {
  let d = 1;
  for (let i = 0; i < 10; i++) d = adaptDensity(d, 40);
  assert.equal(d, 0.3);
  assert.equal(adaptDensity(0.3, 40), 0.3);
  for (let i = 0; i < 30; i++) d = adaptDensity(d, 8);
  assert.equal(d, 1);
  assert.equal(adaptDensity(0.7, 16), 0.7, "in the comfortable band nothing changes");
});
