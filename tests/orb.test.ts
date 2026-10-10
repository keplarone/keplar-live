import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agitate, bezier, budget, convergence, FAN_DEG, lineControls, NODE_COUNT, NODE_NAMES, place, scrollPhase } from "@/field/orb/math";
import { scrambleAt } from "@/lib/typing/scramble";
import { orbHeroCopy } from "@/lib/narrative";

test("six tiles on an arc above the orb, symmetric, inside the stage", () => {
  assert.equal(NODE_COUNT, 6);
  assert.equal(FAN_DEG.length, 6);
  const p = place({ cx: 720, cy: 450, w: 1000, h: 300 }, 1440, 900);
  assert.equal(p.nodes.length, 6);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(p.nodes[i].x + p.nodes[5 - i].x - 2 * p.orb.x) < 1e-6, "mirror symmetric");
  for (const n of p.nodes) assert.ok(n.y > p.orb.y, "tiles sit above the orb");
  assert.ok(p.nodes[2].y > p.nodes[0].y, "the middle tiles are higher than the outer ones (an arc)");
});

test("lines start at the orb and end at their tile; a bezier hits both ends", () => {
  const p = place({ cx: 400, cy: 300, w: 700, h: 260 }, 800, 600);
  p.nodes.forEach((n, i) => {
    const c = lineControls(p.orb, p.orbR, n, i);
    const a = bezier(c, 0), z = bezier(c, 1);
    assert.ok(Math.hypot(a.x - p.orb.x, a.y - p.orb.y) < p.orbR * 1.05, "starts on the orb");
    assert.ok(Math.hypot(z.x - n.x, z.y - n.y) < 1e-6, "ends at the tile");
  });
});

test("typing stirs the field and it settles; submit converges monotonically", () => {
  let a = 0;
  for (let i = 0; i < 6; i++) a = agitate(a, 0.016, 0.12);
  assert.ok(a > 0.3 && a <= 1);
  for (let i = 0; i < 400; i++) a = agitate(a, 0.016);
  assert.ok(a < 0.01, "decays to calm");
  let prev = -1;
  for (let t = 0; t <= 0.8; t += 0.05) { const c = convergence(t); assert.ok(c >= prev); prev = c; }
  assert.ok(convergence(0.8) > 0.99 && convergence(0) === 0);
});

test("scroll phases: copy fades first, the flood arrives last", () => {
  assert.equal(scrollPhase(0).copy, 1);
  assert.equal(scrollPhase(0).flood, 0);
  assert.ok(scrollPhase(0.5).copy === 0 && scrollPhase(0.5).flood === 0);
  assert.equal(scrollPhase(1).flood, 1);
  assert.equal(scrollPhase(1).lines, 0);
});

test("budgets: mobile and low tiers are lighter, the pixel ratio is always capped", () => {
  assert.ok(budget("low", false).orbit < budget("high", false).orbit);
  assert.ok(budget("high", true).orbit < budget("high", false).orbit);
  for (const q of ["low", "medium", "high"] as const) for (const m of [true, false]) assert.ok(budget(q, m).dprCap <= 1.75);
});

test("headline scramble ends exactly on the real text and never changes spaces or punctuation", () => {
  for (const line of ["One question.", "Multiple intelligences.", "One answer."]) {
    assert.equal(scrambleAt(line, 1).map((c) => c.ch).join(""), line);
    const mid = scrambleAt(line, 0.3, 3).map((c) => c.ch).join("");
    assert.equal(mid.length, line.length);
    assert.ok(Array.from(line).every((c, i) => (c === " " || c === ".") ? mid[i] === c : true));
  }
});

test("hero copy is truthful: no accuracy claims or fake stats; model names are plain text from the catalogue; no logos", () => {
  const text = [orbHeroCopy.pill, orbHeroCopy.sub, orbHeroCopy.note, ...orbHeroCopy.chips].join(" ");
  assert.ok(!/\d+\s?%|accura|guarantee|always right|never wrong|#1|best/i.test(text), text);
  const catalog = readFileSync("src/lib/orchestration/catalog.json", "utf8");
  for (const n of NODE_NAMES) assert.ok(catalog.includes(`"provider": "${n}"`), `${n} is a provider in the catalogue`);
  const tsx = readFileSync("src/components/home/OrbHero.tsx", "utf8");
  assert.ok(!/<img|\.svg"|next\/image/.test(tsx), "no logo images");
  assert.match(tsx, /Names belong|orbHeroCopy/);
  assert.match(orbHeroCopy.note, /belong to their owners/);
});

test("hero wiring: composer stays an uncontrolled textarea, typing only bumps a number, submit converges before navigating, reduced motion is still", () => {
  const tsx = readFileSync("src/components/home/OrbHero.tsx", "utf8");
  assert.ok(!/\bvalue=\{/.test(tsx));
  assert.match(tsx, /scene\.current\?\.agitate\(/);
  assert.match(tsx, /converge\(\)\.then\(run\)/);
  assert.match(tsx, /window\.setTimeout\(run, 1700\)/, "navigation never waits on the animation forever");
  const sc = readFileSync("src/field/orb/scene.ts", "utf8");
  assert.match(sc, /Math\.min\(window\.devicePixelRatio \|\| 1, this\.b\.dprCap\)/);
  assert.match(sc, /visibilitychange/);
  assert.match(sc, /webglcontextlost/);
  assert.match(sc, /dispose\(\)/);
  assert.match(sc, /if \(this\.o\.still\)/);
  assert.ok(!/0x[0-9a-f]{0,2}[0-9a-f]{2}ff\b/i.test(readFileSync("src/field/orb/glsl.ts", "utf8").replace(/0xffffff/gi, "")), "no blue literals");
});
