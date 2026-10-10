import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BOOM_FADE_FROM, BOOM_LIFE, BOOM_RESPONSE_GLSL, BOOM_SLOTS, BOOM_TINTS, BOOM_VARIANTS, BoomDirector, BoomSlots, NudgeSpring,
  boomEnvelope, boomLife, boomResponse, type BoomSpec,
} from "../src/field/boom";
import { SCENE_VERT } from "../src/field/scene-glsl";

/** Small seeded generator so a failure is reproducible. */
const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

test("boom variants: never the same effect twice in a row, over many seeds and degenerate random sources", () => {
  for (const rng of [lcg(1), lcg(2), lcg(99), () => 0, () => 0.999999, () => 0.5, Math.random]) {
    const d = new BoomDirector(rng);
    let prev = -1;
    for (let i = 0; i < 3000; i++) {
      const v = d.next(1).variant;
      assert.ok(Number.isInteger(v) && v >= 0 && v < BOOM_VARIANTS.length);
      assert.notEqual(v, prev, `repeat at draw ${i}`);
      prev = v;
    }
  }
});

test("boom variants: every effect shows up (each run of 8 draws is a full shuffle) and the order differs between runs", () => {
  const d = new BoomDirector(lcg(7));
  const orders = new Set<string>();
  for (let r = 0; r < 40; r++) {
    const run = Array.from({ length: BOOM_VARIANTS.length }, () => d.next(1).variant);
    assert.equal(new Set(run).size, BOOM_VARIANTS.length, `run ${r} used all variants once`);
    orders.add(run.join(""));
  }
  assert.ok(orders.size > 25, `orders are shuffled, not a fixed cycle (${orders.size} distinct of 40)`);
  assert.ok(BOOM_VARIANTS.length >= 8 && ["rings", "spiral", "radial", "vortex", "fracture", "ripple"].every((n) => (BOOM_VARIANTS as readonly string[]).includes(n)));
});

test("boom specs randomize origin jitter, intensity, rotation, particle share, timing, camera nudge and accent tint", () => {
  const d = new BoomDirector(lcg(42));
  const specs: BoomSpec[] = Array.from({ length: 200 }, () => d.next(0.8));
  const spread = (f: (s: BoomSpec) => number) => { const v = specs.map(f); return Math.max(...v) - Math.min(...v); };
  assert.ok(spread((s) => s.intensity) > 0.4);
  assert.ok(spread((s) => s.rot) > 5);
  assert.ok(spread((s) => s.frac) > 0.4);
  assert.ok(spread((s) => s.tau) > 0.15);
  assert.ok(spread((s) => s.jitter[0]) > 2 && spread((s) => s.jitter[1]) > 1.5 && spread((s) => s.jitter[2]) > 1);
  assert.ok(spread((s) => s.nudge[1]) > 0.4 && spread((s) => s.nudge[2]) > 0.5);
  assert.ok(specs.some((s) => s.nudge[0] > 0) && specs.some((s) => s.nudge[0] < 0), "nudge yaw goes both ways");
  assert.ok(new Set(specs.map((s) => s.tint)).size === BOOM_TINTS.length, "every accent tint is used");
  for (const s of specs) {
    assert.ok(s.intensity >= 0.35 && s.intensity <= 2.1);
    assert.ok(s.tau >= 0.3 && s.tau <= 0.56 && s.frac >= 0.35 && s.frac <= 0.95);
    assert.ok(Math.abs(s.nudge[0]) <= 0.045 && Math.abs(s.nudge[1]) <= 0.3 && Math.abs(s.nudge[2]) <= 0.5, "camera nudges stay small");
    assert.ok((BOOM_TINTS as readonly number[]).includes(s.tint), "tints are palette slots, no new colours");
  }
  // two consecutive booms are never identical
  for (let i = 1; i < specs.length; i++) assert.notDeepEqual(specs[i], specs[i - 1]);
});

test("the impulse response starts at zero, peaks once, and is exactly zero at the end of the boom: nothing snaps", () => {
  for (const tau of [0.3, 0.45, 0.56]) {
    assert.equal(boomResponse(0, tau), 0);
    assert.equal(boomEnvelope(0, tau), 0);
    assert.equal(boomEnvelope(BOOM_LIFE * tau, tau), 0);
    assert.equal(boomEnvelope(BOOM_LIFE * tau + 5, tau), 0);
    assert.ok(Math.abs(boomResponse(tau, tau) - 1) < 1e-12, "peak is 1 at t = tau");
    // continuity: no step larger than a smooth curve allows between samples 1/240 s apart (a 240 Hz sweep)
    let prev = boomEnvelope(0, tau);
    let maxStep = 0;
    for (let t = 1 / 240; t <= BOOM_LIFE * tau + 0.05; t += 1 / 240) {
      const e = boomEnvelope(t, tau);
      maxStep = Math.max(maxStep, Math.abs(e - prev));
      prev = e;
    }
    // the steepest part is the very start (the velocity kick, e/tau per second); there is never a step beyond that slope
    assert.ok(maxStep <= ((Math.E / tau) / 240) * 1.01, `max per-sample change ${maxStep.toFixed(4)} (tau ${tau})`);
    // the tail fade only starts late and is monotone down
    assert.equal(boomLife(BOOM_FADE_FROM * tau, tau), 1);
    let last = 1;
    for (let t = BOOM_FADE_FROM * tau; t <= BOOM_LIFE * tau; t += 0.01) { const l = boomLife(t, tau); assert.ok(l <= last + 1e-12); last = l; }
  }
});

test("the shader uses the same curve and only ADDS an offset to wherever each point already is (no teleport, no reset)", () => {
  assert.ok(SCENE_VERT.includes(BOOM_RESPONSE_GLSL.trim()), "shader embeds the shared response");
  assert.match(BOOM_RESPONSE_GLSL, new RegExp(`smoothstep\\(${BOOM_FADE_FROM}\\.0 \\* tau, ${BOOM_LIFE}\\.0 \\* tau, t\\)`));
  assert.match(SCENE_VERT, /float x = max\(t, 0\.0\) \/ tau; return x \* exp\(1\.0 - x\);/);
  assert.ok(!/uBoomO|uBoomT|uBoomK|bornFade/.test(SCENE_VERT), "the old 'throw points to the origin' burst is gone");
  assert.ok(!/mix\(\s*uBo/.test(SCENE_VERT), "no point is ever mixed toward a boom origin");
  const loop = SCENE_VERT.slice(SCENE_VERT.indexOf("// boom: impulses layered"), SCENE_VERT.indexOf("vec4 mv ="));
  assert.match(loop, /p \+= boomPush\(/);
  assert.equal((loop.match(/\bp\s*=[^=]/g) ?? []).length, 0, "p is only ever incremented in the boom loop");
  assert.match(SCENE_VERT, new RegExp(`uniform vec4 uBo\\[${BOOM_SLOTS}\\]`));
  // reduced motion path moves nothing
  const calm = loop.slice(loop.indexOf("uCalm > 0.5"), loop.indexOf("} else {"));
  assert.ok(!/p\s*\+=/.test(calm) && /boost \+=/.test(calm));
});

test("slots: firing a new boom leaves the running ones untouched, overlaps, and clocks only move forward", () => {
  const slots = new BoomSlots();
  const d = new BoomDirector(lcg(3));
  const first = slots.fire(d.next(1), [1, 2, 0]);
  slots.advance(0.3);
  const snap = { t: slots.slots[first]!.t, spec: slots.slots[first]!.spec, origin: slots.slots[first]!.origin };
  const second = slots.fire(d.next(1), [-3, 1, 0]);
  assert.notEqual(first, second);
  assert.equal(slots.slots[first]!.t, snap.t, "first boom's clock is not reset by the second");
  assert.equal(slots.slots[first]!.spec, snap.spec);
  assert.deepEqual(slots.slots[first]!.origin, snap.origin);
  assert.equal(slots.slots[second]!.t, 0);
  assert.equal(slots.active, 2);
  const before = slots.slots.map((s) => s?.t ?? -1);
  slots.advance(0.016);
  slots.slots.forEach((s, i) => { if (s) assert.ok(s.t > before[i]); });
  // run everything out: all slots free again
  for (let i = 0; i < 600; i++) slots.advance(0.016);
  assert.equal(slots.active, 0);
  // uniforms: free slots are -1
  const a = new Float32Array(BOOM_SLOTS * 4), b = new Float32Array(BOOM_SLOTS * 4), c = new Float32Array(BOOM_SLOTS * 4);
  slots.fire(d.next(1), [0, 0, 0]);
  slots.write(a, b, c);
  assert.equal(a[3], 0);
  for (let i = 1; i < BOOM_SLOTS; i++) assert.equal(a[i * 4 + 3], -1);
});

test("slots: a burst of clicks past the slot count reuses the boom that is furthest through its life, never a fresh one", () => {
  const slots = new BoomSlots();
  const d = new BoomDirector(lcg(5));
  for (let i = 0; i < BOOM_SLOTS; i++) { slots.fire(d.next(1), [0, 0, 0]); slots.advance(0.1); }
  const ages = slots.slots.map((s) => s!.t);
  const oldest = ages.indexOf(Math.max(...ages));
  const used = slots.fire(d.next(1), [0, 0, 0]);
  assert.equal(used, oldest);
  assert.equal(slots.active, BOOM_SLOTS);
});

test("reduced motion: a boom is a ~1 s fade (the shader moves nothing), and it is not dropped", () => {
  const slots = new BoomSlots(true);
  const d = new BoomDirector(lcg(9));
  slots.fire(d.next(1), [0, 0, 0]);
  slots.advance(0.5);
  assert.equal(slots.active, 1);
  slots.advance(0.5);
  assert.equal(slots.active, 0);
});

test("camera nudge is a spring: an impulse changes velocity, not position, and it glides back to rest", () => {
  const sp = new NudgeSpring();
  sp.kick([0.04, 0.3, -0.5]);
  assert.deepEqual(sp.x, [0, 0, 0], "no jump at the moment of the nudge");
  let peak = [0, 0, 0];
  let maxStep = 0;
  let prev = [0, 0, 0];
  for (let i = 0; i < 60 * 4; i++) {
    sp.step(1 / 60);
    peak = peak.map((p, k) => Math.max(p, Math.abs(sp.x[k])));
    maxStep = Math.max(maxStep, ...sp.x.map((v, k) => Math.abs(v - prev[k])));
    prev = [...sp.x];
  }
  assert.ok(peak[0] > 0.001 && peak[0] < 0.08 && peak[1] < 0.5 && peak[2] < 0.6, `bounded peak ${peak.map((p) => p.toFixed(3))}`);
  assert.ok(maxStep < 0.05, `no per-frame jump (${maxStep.toFixed(4)})`);
  assert.ok(sp.x.every((v) => Math.abs(v) < 0.002), "back at rest after 4 s");
  // overlapping nudges add velocity on top of the current motion (still no position jump)
  const s2 = new NudgeSpring();
  s2.kick([0.03, 0.2, 0.2]);
  for (let i = 0; i < 10; i++) s2.step(1 / 60);
  const x = [...s2.x];
  s2.kick([-0.03, -0.2, 0.3]);
  assert.deepEqual(s2.x, x);
});

test("no re-init on select: boom() only schedules an impulse (no buffer rebuild, no clock or scene reset) and the camera drift eases", () => {
  const src = readFileSync("src/field/scene-engine.ts", "utf8");
  const start = src.indexOf("  boom(x: number");
  const body = src.slice(start, src.indexOf("  /** Read-only snapshot"));
  assert.ok(body.length > 100);
  for (const bad of ["fill(", "this.time", "buildT", "morph", "setScene", "BufferAttribute", "setAttribute", "attrs(", "camTarget", "this.cam[", "dispose", "new SceneEngine", "setSize", "applySize"]) {
    assert.ok(!body.includes(bad), `boom() must not touch ${bad}`);
  }
  assert.match(body, /this\.booms\.fire\(/);
  assert.match(body, /this\.nudge\.kick\(/);
  // the frame loop never zeroes the motion clock or the build-in because a boom happened
  const frame = src.slice(src.indexOf("private frame ="), src.indexOf("private governor"));
  assert.ok(!/this\.time = 0|this\.buildT = 0|this\.morphT = 0/.test(frame));
  assert.match(frame, /this\.driftK = ease\(/, "idle camera drift fades in/out instead of switching");
  // the page handler forwards boom events as boom only (it does not recreate the field or switch scenes)
  const page = readFileSync("src/components/field/PageField.tsx", "utf8");
  const h = page.slice(page.indexOf('if (d.phase === "boom") c.handle?.boom('), page.indexOf('if (d.phase === "boom") c.handle?.boom(') + 120);
  assert.match(h, /c\.handle\?\.boom\(d\.x, d\.y, d\.strength\)/);
});
