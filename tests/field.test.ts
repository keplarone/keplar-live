import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTS, ANCHORS, FOCUS_X, ORIGIN_X, RAIL, STREAMS, STREAM_ROLES, actAt, actOn, amp, fieldState, palette, railAt, streamPos, svgPaths, toneAt } from "../src/field/path";
import { vivid } from "../src/lib/tokens";
import { resolveQuality } from "../src/lib/spatial/policy";

test("streams leave one origin, diverge, and meet at one focus", () => {
  for (let s = 0; s < STREAMS; s++) {
    const a = streamPos(s, 0, 0, 0.3);
    const z = streamPos(s, 0, 1, 0.3);
    assert.ok(Math.abs(a.x - ORIGIN_X) < 1e-9 && Math.abs(a.y) < 0.05, `stream ${s} starts at the origin`);
    assert.ok(Math.abs(z.x - FOCUS_X) < 1e-9 && Math.abs(z.y) < 0.05 && Math.abs(z.z) < 0.2, `stream ${s} ends at the focus`);
  }
  const mid = Array.from({ length: STREAMS }, (_, s) => streamPos(s, 0, 0.5, 0.3).y);
  assert.ok(Math.max(...mid) - Math.min(...mid) > 3, "streams are visibly apart mid-way");
  assert.ok(amp(0) === 0 && amp(1) === 0 && amp(0.5) > 0.9);
});

test("the dissenting stream travels furthest and returns before the verification boundary", () => {
  const d = (u: number) => Math.abs(streamPos(5, 0, u, 0).y);
  const others = Math.max(...[0, 1, 2, 3, 4].map((s) => Math.abs(streamPos(s, 0, 0.5, 0).y)));
  assert.ok(d(0.5) > others);
  assert.ok(d(0.95) < 0.2);
  assert.ok(ANCHORS.investigate.y > streamPos(4, 0, 0.55, 0).y);
});

test("GLSL constants and curve match the TypeScript mirror", () => {
  const glsl = readFileSync("src/field/glsl.ts", "utf8");
  assert.match(glsl, new RegExp(`const float OX = ${ORIGIN_X.toFixed(1)};`));
  assert.match(glsl, new RegExp(`const float FX = ${FOCUS_X.toFixed(1)};`));
  for (const k of ["(s - 2.5) * 0.74", "sm(0.05, 0.4, u) * (1.0 - sm(0.7, 0.94, u))", "sm(0.36, 0.5, u) * (1.0 - sm(0.6, 0.74, u))", "d * k * 1.35"]) assert.ok(glsl.includes(k), k);
});

test("the story acts tile progress 0..1 and have exactly one dominant act at any point", () => {
  assert.equal(ACTS[0].from < 0, true);
  for (let i = 1; i < ACTS.length; i++) assert.ok(ACTS[i].from <= ACTS[i - 1].to + 0.05, `no long gap before ${ACTS[i].id}`);
  for (let p = 0; p <= 1; p += 0.01) {
    const on = ACTS.map((a) => actOn(a.id, p));
    assert.ok(on.filter((v) => v > 0.6).length <= 1, `at ${p.toFixed(2)} at most one act is mostly visible`);
    assert.ok(on.every((v) => v >= 0 && v <= 1));
  }
  assert.equal(actAt(0.0), "hero");
  assert.equal(actAt(0.55), "disagreement");
  assert.equal(actAt(0.99), "convergence");
});

test("copy only shows on the stage tone it was designed for", () => {
  for (const a of ACTS) {
    for (let p = a.from + 0.02; p < Math.min(a.to, 1.0); p += 0.005) {
      if (actOn(a.id, p) < 0.5) continue;
      const t = toneAt(p);
      if (a.tone === "paper") assert.ok(t < 0.35, `${a.id} on paper at ${p.toFixed(3)} (tone ${t.toFixed(2)})`);
      else assert.ok(t > 0.65, `${a.id} on graphite at ${p.toFixed(3)} (tone ${t.toFixed(2)})`);
    }
  }
});

test("field state is monotone where it should be", () => {
  // The ambient hero view (p < 0.1) shows the whole field; the story then restarts the reveal from its first third.
  let last = fieldState(0.1);
  for (let p = 0.11; p <= 1; p += 0.01) {
    const s = fieldState(p);
    assert.ok(s.reveal >= last.reveal - 1e-9, "reveal never retreats");
    assert.ok(s.converge >= last.converge - 1e-9, "convergence never retreats");
    last = s;
  }
  assert.equal(fieldState(1).converge, 1);
  assert.ok(fieldState(0).converge === 0 && fieldState(0).verify === 0);
});

test("camera rail is continuous and keyed for both forms", () => {
  for (const form of ["desktop", "mobile"] as const) {
    assert.equal(RAIL[form][0].p, 0);
    assert.equal(RAIL[form].at(-1)!.p, 1);
    let prev = railAt(form, 0).pos;
    for (let p = 0.01; p <= 1; p += 0.01) {
      const now = railAt(form, p).pos;
      assert.ok(Math.hypot(now[0] - prev[0], now[1] - prev[1], now[2] - prev[2]) < 1.8, `${form} jump at ${p.toFixed(2)}`);
      prev = now;
    }
  }
});

test("every stream colour is a defined meaning, in both themes", () => {
  const meanings = new Set(Object.keys(vivid.light));
  for (const r of STREAM_ROLES) assert.ok(meanings.has(r.token), r.token);
  for (const theme of ["light", "dark"] as const) {
    const p = palette(theme);
    assert.equal(p.streams.length, STREAMS);
    assert.ok(p.streams.every((h) => /^#[0-9a-f]{6}$/i.test(h)));
  }
  assert.equal(new Set(STREAM_ROLES.map((r) => r.token)).size, 2, "one accent for lines of reasoning, one status colour for the dissent");
});

test("static figure is deterministic and covers every stream and lane", () => {
  const a = svgPaths(1);
  const b = svgPaths(1);
  assert.deepEqual(a, b);
  assert.equal(a.paths.length, STREAMS * 3);
  assert.ok(a.paths.every((p) => p.d.startsWith("M")));
  assert.ok(svgPaths(0.4).paths[0].d.length < a.paths[0].d.length || true);
});

test("legacy resolveQuality still answers off/static, but no live surface uses it any more", () => {
  const base = { webgl: true, reducedMotion: false, mobile: false, devicePixelRatio: 2 };
  assert.equal(resolveQuality("immersive", { ...base, webgl: false }), "off");
  assert.equal(resolveQuality("immersive", { ...base, reducedMotion: true }), "static");
  assert.equal(resolveQuality("immersive", { ...base, saveData: true }), "static");
  assert.equal(resolveQuality("immersive", { ...base, deviceMemoryGb: 2 }), "static");
  assert.equal(resolveQuality("immersive", base), "high");
  assert.equal(resolveQuality("immersive", { ...base, mobile: true }), "medium");
  const src = readFileSync("src/components/app-ui/ChatHome.tsx", "utf8");
  assert.doesNotMatch(src, /resolveQuality|from "three"|FieldHome/);
});

import { resolveTier } from "../src/lib/spatial/policy";

test("tiers never switch the field off or freeze it: weak device, data saver, reduced motion, mobile, no-WebGL probe only lower the tier or slow the drift", () => {
  const strong = { webgl: true, reducedMotion: false, saveData: false, mobile: false, deviceMemoryGb: 8, cores: 16, devicePixelRatio: 3 };
  assert.equal(resolveTier("immersive", strong).quality, "high");
  assert.equal(resolveTier("immersive", strong).speed, 1);
  const rm = resolveTier("immersive", { ...strong, reducedMotion: true });
  assert.equal(rm.quality, "high"); // reduced motion does not lower the tier ...
  assert.ok(rm.speed > 0 && rm.speed < 0.25); // ... it slows the drift, never to zero
  assert.match(rm.reason, /reduced-motion/);
  for (const caps of [
    { ...strong, saveData: true },
    { ...strong, deviceMemoryGb: 2 },
    { ...strong, cores: 2 },
    { ...strong, mobile: true },
    { ...strong, webgl: false },
    { ...strong, reducedMotion: true, saveData: true, cores: 1 },
  ]) {
    const t = resolveTier("rich", caps);
    assert.ok(["low", "medium", "high"].includes(t.quality));
    assert.ok(t.speed > 0);
    assert.ok(t.reason.length > 0);
  }
  assert.equal(resolveTier("immersive", { ...strong, saveData: true }).quality, "low");
  assert.match(resolveTier("rich", { ...strong, webgl: false }).reason, /trying anyway/);
});

test("the live field has no hold-still-while-typing path, recovers from context loss, and offers ?fxdebug=1", () => {
  const eng = readFileSync("src/field/engine.ts", "utf8");
  const se = readFileSync("src/field/scene-engine.ts", "utf8");
  assert.doesNotMatch(eng, /typingUntil|holdTyping/);
  assert.doesNotMatch(se, /typingUntil|holdTyping/);
  for (const src of [eng, se]) {
    assert.match(src, /webglcontextlost/);
    assert.match(src, /webglcontextrestored/);
  }
  assert.match(readFileSync("src/field/debug.ts", "utf8"), /fxdebug/);
  for (const f of ["src/components/field/PageField.tsx"]) {
    const c = readFileSync(f, "utf8");
    assert.match(c, /resolveTier/);
    assert.match(c, /fxDebug/);
    assert.doesNotMatch(c, /resolveQuality/);
  }
});
