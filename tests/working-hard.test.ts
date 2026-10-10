import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hash01, pulseEnvelope, swarmSeeds, workingDpr, workingPath, workingPoints, workingState } from "@/lib/working-hard";
import { buttonFxAllowed, magnetOffset } from "@/lib/button-fx";

const base = { t: 3, sincePulse: Infinity };
test("progress is real: the swarm tightens only as progress rises, and unknown progress never creeps to done", () => {
  const a = workingState({ ...base, progress: 0 });
  const b = workingState({ ...base, progress: 0.5 });
  const c = workingState({ ...base, progress: 1 });
  assert.ok(a.radius > b.radius && b.radius > c.radius);
  assert.ok(a.spin < c.spin);
  // unknown: same radii band at any time; it breathes, it does not trend
  const radii = Array.from({ length: 200 }, (_, k) => workingState({ ...base, t: k * 0.37 }).radius);
  assert.ok(Math.min(...radii) >= 2.2 - 1e-9 && Math.max(...radii) <= 2.7 + 1e-9);
  assert.ok(Math.max(...radii.slice(0, 100)) > 2.5 && Math.max(...radii.slice(100)) > 2.5, "no drift toward a smaller ring over time");
  assert.deepEqual(workingState({ ...base, progress: Number.NaN }), workingState({ ...base }), "NaN counts as unknown");
});

test("every real event flares and then decays; done settles; failed dims", () => {
  assert.equal(pulseEnvelope(Infinity), 0);
  assert.equal(pulseEnvelope(0), 0);
  assert.ok(pulseEnvelope(0.08) > 0.8);
  assert.ok(pulseEnvelope(0.08) > pulseEnvelope(0.6) && pulseEnvelope(0.6) > pulseEnvelope(2));
  assert.ok(pulseEnvelope(5) < 0.001);
  const calm = workingState({ ...base, progress: 0.3 });
  const hit = workingState({ ...base, progress: 0.3, sincePulse: 0.1 });
  assert.ok(hit.burst > calm.burst && hit.glow >= calm.glow && hit.spin > calm.spin);
  const done = workingState({ ...base, progress: 1, done: true });
  assert.equal(done.glow, 1);
  assert.ok(done.spread < 0.2);
  const failed = workingState({ ...base, progress: 0.4, failed: true });
  assert.ok(failed.glow < 0.3 && failed.spin < 0.2);
  assert.equal(workingState({ ...base, done: true, failed: true }).glow, failed.glow, "failed wins over done");
});

test("the swarm is deterministic and bounded; the low-power path and pixel ratio are capped", () => {
  assert.equal(hash01(5), hash01(5));
  const seeds = swarmSeeds(300);
  assert.equal(seeds.length, 1200);
  for (const v of seeds) assert.ok(Number.isFinite(v));
  assert.ok(workingPoints(390, 3) < workingPoints(1200, 1));
  assert.ok(workingPoints(1200, 1) <= 1800);
  assert.ok(workingDpr(3, 800, 600) <= 1.5 && workingDpr(3, 300, 200) <= 1.75 && workingDpr(0.5, 300, 200) === 1);
  const ok = { reducedMotion: false, saveData: false, lowMemory: false, cores: 8, webgl: true };
  assert.equal(workingPath(ok), "three");
  for (const bad of [{ webgl: false }, { reducedMotion: true }, { saveData: true }, { lowMemory: true }, { cores: 1 }]) assert.equal(workingPath({ ...ok, ...bad }), "css");
});

test("WorkingHard loads three lazily, never fakes progress, disposes, and keeps a CSS fallback", () => {
  const c = readFileSync("src/components/loader/WorkingHard.tsx", "utf8");
  assert.ok(!/from "three"/.test(c), "three is only reachable through the dynamic import");
  assert.match(c, /import\("\.\/working-scene"\)/);
  assert.match(c, /sceneRef\.current\?\.dispose\(\)/);
  assert.match(c, /KLoader/);
  assert.ok(!/setInterval|Math\.random/.test(c), "no timers that could invent progress");
  const sc = readFileSync("src/components/loader/working-scene.ts", "utf8");
  for (const needle of ["geo.dispose()", "mat.dispose()", "renderer.dispose()", "forceContextLoss", "cancelAnimationFrame", "IntersectionObserver", "workingDpr"]) assert.ok(sc.includes(needle), needle);
  assert.ok(!/Math\.random/.test(sc));
});

test("button effects: magnet is bounded, off for touch / reduced motion / data saver, composes with transform", () => {
  const r = { left: 100, top: 100, width: 100, height: 40 };
  assert.deepEqual(magnetOffset(150, 120, r), [0, 0]);
  const [x, y] = magnetOffset(1000, -1000, r);
  assert.ok(Math.abs(x) <= 6 && Math.abs(y) <= 6);
  assert.equal(buttonFxAllowed({ finePointer: true, reducedMotion: false, saveData: false }), true);
  for (const off of [{ finePointer: false }, { reducedMotion: true }, { saveData: true }]) assert.equal(buttonFxAllowed({ finePointer: true, reducedMotion: false, saveData: false, ...off }), false);
  const fx = readFileSync("src/components/ui/ButtonFx.tsx", "utf8");
  assert.match(fx, /style\.translate/);
  assert.ok(!/style\.transform/.test(fx));
  const css = readFileSync("src/styles/lit.css", "utf8");
  assert.match(css, /\[data-lit\]\[aria-busy="true"\]::after/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*aria-busy/);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /<ButtonFx \/>/);
  assert.match(readFileSync("src/components/ui/Button.tsx", "utf8"), /aria-busy=\{loading \|\| undefined\}/);
});
