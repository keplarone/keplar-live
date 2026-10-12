import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notePreloaded, predictionOn, predictionStats, predictNext, recordTransition, setPredictionOn } from "@/components/app-ui/predict";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), dump: () => [...m.values()].join("") };
};

test("learns the usual next view; one-off transitions are not predicted", () => {
  const s = mem();
  recordTransition("projects", "create", s);
  assert.deepEqual(predictNext("projects", 2, s), [], "seen once is not a habit");
  recordTransition("projects", "create", s);
  recordTransition("projects", "slides", s);
  assert.deepEqual(predictNext("projects", 2, s), ["create"]);
  for (let i = 0; i < 3; i++) recordTransition("projects", "slides", s);
  assert.deepEqual(predictNext("projects", 2, s), ["slides", "create"]);
});

test("the Ask page is strict (a strong habit only); old habits decay", () => {
  const s = mem();
  recordTransition("thread", "create", s);
  recordTransition("thread", "create", s);
  recordTransition("thread", "study", s);
  assert.deepEqual(predictNext("thread", 2, s, true), [], "twice is not enough on Ask");
  recordTransition("thread", "create", s);
  assert.deepEqual(predictNext("thread", 2, s, true), ["create"]);
  for (let i = 0; i < 60; i++) recordTransition("thread", "study", s);
  assert.equal(predictNext("thread", 1, s)[0], "study", "new habits take over");
});

test("precision is measured: a preload counts as used only if that view is opened next", () => {
  const s = mem();
  notePreloaded(["create"], s);
  recordTransition("thread", "create", s);
  notePreloaded(["slides"], s);
  recordTransition("create", "study", s);
  assert.deepEqual(predictionStats(s), { made: 2, used: 1, precision: 0.5 });
});

test("privacy and control: view names only, off with Save-Data, and turning it off forgets everything", () => {
  const s = mem();
  recordTransition("thread", "create", s);
  recordTransition("thread", "create", s);
  recordTransition("thread", "<script>", s);
  assert.ok(!s.dump().includes("script"), "only view-name shaped strings are kept");
  assert.equal(predictionOn(s, { connection: { saveData: true } }), false);
  setPredictionOn(false, s);
  assert.equal(predictionOn(s), false);
  assert.deepEqual(predictNext("thread", 2, s), []);
  recordTransition("thread", "create", s);
  setPredictionOn(true, s);
  assert.deepEqual(predictNext("thread", 2, s), [], "what was learned before turning it off is gone");
  assert.deepEqual(predictionStats(s), { made: 0, used: 0, precision: null });
});

test("wiring: the app only preloads code for Keplar One studios (never Business), and the switch is in account settings", () => {
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /const warmers: Partial<Record<View, \(\) => Promise<unknown>>> = \{ create: create\.warm, slides: slides\.warm, study: study\.warm \};/);
  assert.match(app, /predictNext\(to, 2, undefined, to === "thread"\)/, "strict on the Ask page");
  assert.match(readFileSync("src/components/account/AccountSettings.tsx", "utf8"), /<PredictionSettings \/>/);
});
