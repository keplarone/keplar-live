import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, assignArm, EXPERIMENTS, experimentById, exposureTag, normalCdf, runningIds, sampleRatioP, twoProportionP, type Experiment } from "@/lib/growth/experiments";
import { funnel, sanitizeSeoEvent, type SeoEventRow } from "@/lib/seo/events";

const exp = experimentById("home-cta")!;
const small: Experiment = { ...exp, minPerArm: 50, minConversions: 10 };
const vidOf = (i: number) => i.toString(16).padStart(24, "0");
let n = 0;
const row = (event: string, vid: string, at: string, where?: string, dev?: string) => ({ id: `r${++n}`, workspaceId: "system", at, day: at.slice(0, 10), event, landing: "/", src: "direct", vid, ...(where ? { where } : {}), ...(dev ? { dev } : {}) }) as unknown as SeoEventRow;

test("nothing runs unless an admin lists it; unknown or malformed ids are ignored", () => {
  assert.equal(runningIds(undefined).size, 0);
  assert.equal(runningIds("").size, 0);
  assert.deepEqual([...runningIds(" home-cta , nope, ../x ")], ["home-cta"]);
  assert.equal(EXPERIMENTS.every((e) => e.arms.length >= 2 && e.minPerArm >= 100), true, "registered experiments need real samples");
});

test("assignment is stable per browser and follows the weights", () => {
  const counts: Record<string, number> = {};
  for (let i = 0; i < 20_000; i++) {
    const v = vidOf(i * 7919);
    const a = assignArm(exp, v).id;
    assert.equal(assignArm(exp, v).id, a, "same browser, same arm");
    counts[a] = (counts[a] ?? 0) + 1;
  }
  assert.ok(Math.abs(counts.control / 20_000 - 0.5) < 0.02, JSON.stringify(counts));
  const skewed: Experiment = { ...exp, arms: [{ ...exp.arms[0], weight: 9 }, { ...exp.arms[1], weight: 1 }] };
  const ctl = Array.from({ length: 10_000 }, (_, i) => assignArm(skewed, vidOf(i * 31))).filter((a) => a.id === "control").length;
  assert.ok(Math.abs(ctl / 10_000 - 0.9) < 0.02, String(ctl));
});

test("statistics: normal CDF, two-proportion test and sample-ratio check", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1.959964) - 0.975) < 1e-4);
  assert.ok(Math.abs(normalCdf(-1.644854) - 0.05) < 1e-4);
  assert.ok(twoProportionP(100, 1000, 100, 1000)! > 0.99);
  assert.ok(twoProportionP(100, 1000, 150, 1000)! < 0.01);
  assert.equal(twoProportionP(0, 0, 1, 10), null);
  assert.ok(sampleRatioP([500, 500], [1, 1])! > 0.9);
  assert.ok(sampleRatioP([600, 400], [1, 1])! < 0.001);
  assert.ok(sampleRatioP([300, 330, 310], [1, 1, 1])! > 0.05);
});

/** Browsers 0..n-1 exposed at 10:00; the first `conv(arm)` of each arm convert at 11:00. */
function scenario(perArm: number, conv: Record<string, number>, e: Experiment = small) {
  const rows: SeoEventRow[] = [];
  const got: Record<string, number> = {};
  for (let i = 0; rows.filter((r) => r.event === "experiment_exposure").length < perArm * e.arms.length && i < perArm * 20; i++) {
    const v = vidOf(i + 1);
    const arm = assignArm(e, v).id;
    if ((got[arm] ?? 0) >= perArm) continue;
    got[arm] = (got[arm] ?? 0) + 1;
    rows.push(row("experiment_exposure", v, "2026-10-01T10:00:00.000Z", exposureTag(e.id, arm)));
    if (got[arm] <= conv[arm]) rows.push(row(e.primary, v, "2026-10-01T11:00:00.000Z"));
  }
  return rows;
}

test("the report says 'too early' below the minimum sample, however big the gap", () => {
  const r = analyze(small, scenario(20, { control: 2, ask: 15 }), true);
  assert.equal(r.verdict, "too-early");
  assert.equal(r.arms[1].exposed, 20);
  assert.equal(analyze(small, [], false).verdict, "not-started");
});

test("a real difference is reported with a p-value, and never as an automatic winner", () => {
  const r = analyze(small, scenario(400, { control: 40, ask: 90 }), true);
  assert.equal(r.verdict, "difference");
  assert.ok(r.arms[1].vsControl!.p! < 0.001);
  assert.ok(Math.abs(r.arms[1].vsControl!.diff - 0.125) < 1e-9);
  assert.match(r.note, /a person decides/);
  assert.equal(analyze(small, scenario(400, { control: 40, ask: 44 }), true).verdict, "no-clear-difference");
});

test("conversions before exposure, other experiments and browsers in both arms are not counted", () => {
  const v1 = vidOf(1), v2 = vidOf(2);
  const rows = [
    row("first_prompt", v1, "2026-10-01T09:00:00.000Z"),
    row("experiment_exposure", v1, "2026-10-01T10:00:00.000Z", exposureTag("home-cta", "control")),
    row("experiment_exposure", v2, "2026-10-01T10:00:00.000Z", exposureTag("home-cta", "control")),
    row("experiment_exposure", v2, "2026-10-01T10:05:00.000Z", exposureTag("home-cta", "ask")),
    row("experiment_exposure", vidOf(3), "2026-10-01T10:00:00.000Z", exposureTag("other-exp", "ask")),
  ];
  const r = analyze(small, rows, true);
  assert.equal(r.arms[0].exposed, 1, "v2 saw both arms and is dropped");
  assert.equal(r.arms[0].conversions, 0, "v1 converted before exposure");
  assert.equal(r.arms[1].exposed, 0);
});

test("a broken split is flagged as a sample-ratio mismatch before anything else", () => {
  const rows = Array.from({ length: 300 }, (_, i) => row("experiment_exposure", vidOf(i + 1), "2026-10-01T10:00:00.000Z", exposureTag("home-cta", i < 250 ? "control" : "ask")));
  assert.equal(analyze(small, rows, true).verdict, "sample-ratio-mismatch");
});

test("funnel: distinct browsers per step, rates out of the previous step, split by device", () => {
  const at = "2026-10-01T10:00:00.000Z";
  const rows = [
    row("landing_view", "v1", at, undefined, "mobile"), row("landing_view", "v1", at, undefined, "mobile"), row("landing_view", "v2", at, undefined, "desktop"), row("landing_view", "v3", at),
    row("cta_click", "v1", at, "home:hero:control", "mobile"),
    row("pricing_view", "v2", at, undefined, "desktop"), row("checkout_start", "v2", at, "plan:plus", "desktop"),
  ];
  const f = funnel(rows);
  assert.deepEqual(f.steps.slice(0, 2).map((s) => [s.event, s.browsers, s.previous, s.ofPrevious]), [["landing_view", 3, null, null], ["cta_click", 1, 3, 1 / 3]]);
  assert.equal(f.byDevice.mobile[0].browsers, 1);
  assert.equal(f.byDevice.unknown[0].browsers, 1);
  assert.deepEqual(f.revenue.map((s) => s.browsers), [1, 1, 0]);
});

test("new funnel events and the device class pass the allow-list; free text still does not", () => {
  const v = "a".repeat(24);
  assert.equal(sanitizeSeoEvent({ e: "experiment_exposure", landing: "/", src: "direct", vid: v, where: "x:home-cta:ask", dev: "mobile" })?.dev, "mobile");
  assert.equal(sanitizeSeoEvent({ e: "checkout_start", landing: "/pricing", src: "direct", vid: v, dev: "tablet-ish" })?.dev, undefined);
  assert.equal(sanitizeSeoEvent({ e: "experiment_exposure", landing: "/", src: "direct", vid: v, where: "x:home cta:<b>" })?.where, undefined);
});

test("the home hero button is the experiment's control by default and is counted as a CTA click", () => {
  const hero = readFileSync("src/components/growth/HeroCta.tsx", "utf8");
  assert.match(hero, /useExperiment\("home-cta"\)/);
  assert.match(hero, /track\("cta_click", \{ where: `home:hero:\$\{arm\.id\}` \}\)/);
  assert.equal(exp.arms[0].label, "Try Keplar");
  assert.match(readFileSync("src/components/sky/SkyHome.tsx", "utf8"), /<HeroCta href=\{tryHref\}/);
});
