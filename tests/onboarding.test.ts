import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { LAST_STEP, USES, afterWelcomePath, checklist, legacyUseFor, needsWelcome, planLine, readAnswers, starters, statusOf, validateAnswers, validateProgressKey, validateStep, welcomePath, type Facts } from "@/lib/onboarding/model";
import { SCENE_IDS, buildScene } from "@/field/scenes";
import { profileFor } from "@/field/profile";

test("answers: whitelist, types and lengths are enforced; unknown keys are refused", () => {
  assert.deepEqual(validateAnswers({ uses: ["research", "coding", "research"], role: "  Founder  ", theme: "auto", insertKey: false, memory: true, name: "Ada" }), { uses: ["research", "coding"], role: "Founder", theme: "auto", insertKey: false, memory: true, name: "Ada" });
  for (const bad of [{ uses: ["hacking"] }, { uses: "research" }, { uses: Array(20).fill("research") }, { role: "x".repeat(61) }, { name: "<script>" }, { theme: "neon" }, { memory: "yes" }, { insertKey: 1 }, { isAdmin: true }, { __proto__: { a: 1 }, plan: "business" }, "str", null, [1]]) {
    assert.throws(() => validateAnswers(bad), /./, JSON.stringify(bad));
  }
  assert.equal(validateAnswers({ role: "a\u0000b\nc" }).role, "a b c", "control characters are flattened");
  assert.throws(() => validateStep(5));
  assert.throws(() => validateStep(-1));
  assert.throws(() => validateStep(1.5));
  assert.throws(() => validateStep("2"));
  assert.equal(validateStep(LAST_STEP), LAST_STEP);
  assert.throws(() => validateProgressKey("completedAt"));
  assert.equal(validateProgressKey("viewedPlan"), "viewedPlan");
});

test("stored JSON is read defensively: one bad key never breaks a sign-in", () => {
  assert.deepEqual(readAnswers('{"uses":["writing"],"theme":"nope","name":"Bo"}'), { uses: ["writing"], name: "Bo" });
  assert.deepEqual(readAnswers("not json"), {});
  assert.deepEqual(readAnswers(null), {});
});

test("redirects: onboarding keeps ?next, and open redirects are impossible", () => {
  assert.equal(welcomePath("/app"), "/welcome");
  assert.equal(welcomePath(undefined), "/welcome");
  assert.equal(welcomePath("/pricing?x=1"), "/welcome?next=%2Fpricing%3Fx%3D1");
  assert.equal(welcomePath("https://evil.example"), "/welcome");
  assert.equal(welcomePath("//evil.example/a"), "/welcome");
  assert.equal(welcomePath("/signin"), "/welcome", "never an auth page");
  assert.equal(afterWelcomePath("/pricing"), "/pricing");
  assert.equal(afterWelcomePath("//evil.example"), "/app");
  assert.equal(afterWelcomePath("https://evil.example"), "/app");
  assert.equal(afterWelcomePath("/welcome?next=/welcome"), "/app", "no loop back into the flow");
  assert.equal(afterWelcomePath(undefined), "/app");
});

test("who is sent to onboarding: only accounts that need it and have not finished or skipped", () => {
  const base = { enabled: true, required: true, completedAt: null, skippedAt: null };
  assert.equal(needsWelcome(base), true);
  assert.equal(needsWelcome({ ...base, completedAt: "2026-10-03T00:00:00Z" }), false);
  assert.equal(needsWelcome({ ...base, skippedAt: "2026-10-03T00:00:00Z" }), false);
  assert.equal(needsWelcome({ ...base, required: false }), false, "existing accounts are never forced");
  assert.equal(needsWelcome({ ...base, enabled: false }), false, "no database: nothing to track, nobody is sent");
  assert.equal(statusOf({ required: false, step: 0, completedAt: null, skippedAt: null, startedAt: null }), "legacy");
  assert.equal(statusOf({ required: true, step: 0, completedAt: null, skippedAt: null, startedAt: null }), "pending");
  assert.equal(statusOf({ required: true, step: 2, completedAt: null, skippedAt: null, startedAt: "x" }), "in_progress");
});

test("starter prompts follow the chosen uses: 3-4, no duplicates, every pick represented", () => {
  for (const uses of [[], ["research"], ["coding", "site"], [...USES]] as (typeof USES[number])[][]) {
    const out = starters({ uses });
    assert.ok(out.length >= 3 && out.length <= 4, `${uses.join()} → ${out.length}`);
    assert.equal(new Set(out.map((s) => s.text)).size, out.length);
    assert.ok(out.every((s) => s.text.length > 10 && s.hint));
  }
  const cs = starters({ uses: ["coding", "writing"] });
  assert.match(cs[0].hint, /Coding/);
  assert.match(cs[1].hint, /Writing/);
  assert.match(starters({ uses: ["research"], role: "Nurse" }).map((s) => s.text).join("|"), /new nurses make/);
});

test("older per-device 'use for' follows the picks", () => {
  assert.equal(legacyUseFor({ uses: [] }), null);
  assert.equal(legacyUseFor({ uses: ["business"] }), "business");
  assert.equal(legacyUseFor({ uses: ["learning"] }), "personal");
  assert.equal(legacyUseFor({ uses: ["learning", "site"] }), "both");
});

test("checklist ticks come from real facts and actions, and Free says what it takes", () => {
  const f: Facts = { chats: 0, sites: 0, images: 0, connectors: 0, plan: "free" };
  let list = checklist(f, {});
  assert.deepEqual(list.map((i) => i.done), [false, false, false, false]);
  assert.equal(list.find((i) => i.id === "connect")?.note, "Needs a paid plan");
  list = checklist({ ...f, chats: 2, plan: "plus" }, { viewedPlan: "t" });
  assert.deepEqual(list.map((i) => [i.id, i.done]), [["ask", true], ["create", false], ["connect", false], ["plan", true]]);
  assert.equal(list.find((i) => i.id === "connect")?.note, "Beta");
  assert.equal(checklist({ ...f, sites: 1 }, {}).find((i) => i.id === "create")?.done, true);
  assert.equal(checklist({ ...f }, { triedCreate: "t" }).find((i) => i.id === "create")?.done, true);
  assert.equal(checklist({ ...f, connectors: 1, plan: "plus" }, {}).find((i) => i.id === "connect")?.done, true);
});

test("plan line is honest: Free is free models only, no credit surprises, no quality claims", () => {
  const free = planLine("free");
  assert.match(free, /free models only/i);
  assert.match(free, /nothing to be charged|no credits/i);
  for (const p of ["free", "lite", "plus", "pro", "business", "other"]) assert.doesNotMatch(planLine(p), /\b\d+%|\bmost accurate|\bbest\b|guarantee|#1/i);
});

test("every onboarding scene builds a full point set with a camera pose; picks change the purpose scene", () => {
  const view = { hw: 9, hh: 5 };
  for (const id of SCENE_IDS) {
    const d = buildScene(id, 4000, view);
    assert.equal(d.P.length, 4000 * 3);
    assert.equal(d.cam.length, 4);
    assert.ok(Array.from(d.P).every(Number.isFinite), id);
    if (id.startsWith("onb-")) assert.ok(d.cam.some((x) => x !== 0), `${id} moves the camera`);
    else assert.deepEqual(d.cam, [0, 0, 0, 0], `${id} keeps the fixed camera`);
  }
  const a = buildScene("onb-purpose", 4000, view, 7, { picks: [] });
  const b = buildScene("onb-purpose", 4000, view, 7, { picks: [1, 4] });
  assert.notDeepEqual(Array.from(a.P.slice(0, 300)), Array.from(b.P.slice(0, 300)));
  const portrait = buildScene("onb-welcome", 3000, { hw: 2.85, hh: 6.2 });
  assert.ok(Array.from(portrait.P).every((x) => Math.abs(x) < 40), "no point flies off in a phone-shaped view");
});

test("/welcome gets the onboarding layer profile, other pages are untouched", () => {
  assert.equal(profileFor("/welcome")?.id, "onboarding");
  assert.equal(profileFor("/welcome?next=/app")?.scene, "onb-welcome");
  assert.equal(profileFor("/app")?.id, "app");
  assert.equal(profileFor("/pricing")?.id, "marketing");
});
