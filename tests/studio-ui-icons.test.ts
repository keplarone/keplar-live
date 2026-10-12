import { test } from "node:test";
import assert from "node:assert/strict";
import { canInterpolate, parsePath, pathPoints, pathSignature } from "@/components/app-ui/studio-mode/ui/icons/path-signature";
import { MORPH_ICONS, MORPH_ICON_NAMES, morphStates, morphState, type MorphStateDef } from "@/components/app-ui/studio-mode/ui/icons/morph-paths";
import { GLYPHS, ICON_NAMES } from "@/components/app-ui/studio-mode/ui/icons/glyphs";
import { ULTIMATE } from "@/components/app-ui/studio-mode/ui/ultimate-geometry";

test("parsePath reads absolute commands, expands implicit linetos and rejects junk", () => {
  assert.deepEqual(parsePath("M4 7 L20 7"), [
    { cmd: "M", args: [4, 7] },
    { cmd: "L", args: [20, 7] },
  ]);
  assert.equal(pathSignature("M1 2 3 4 5 6"), "M L L");
  assert.equal(pathSignature("M2 2 A3 3 0 1 1 8 8 Z"), "M A[0,1,1] Z");
  assert.throws(() => parsePath("M1 2 L3"));
  assert.throws(() => parsePath("1 2 L3 4"));
  assert.throws(() => parsePath("M1 2 X3 4"));
  assert.ok(!canInterpolate("M0 0 L1 1", "M0 0 C1 1 1 1 1 1"));
  assert.ok(!canInterpolate("M0 0 A1 1 0 0 1 2 2", "M0 0 A1 1 0 1 1 2 2"), "differing arc flags cannot interpolate");
  assert.ok(canInterpolate("M4 7 L20 7", "M6 6 L18 18"));
});

test("every required morph pair exists", () => {
  const required: Record<string, string[]> = {
    menu: ["menu", "close"],
    plus: ["plus", "close"],
    play: ["play", "pause"],
    send: ["send", "working", "complete"],
    expand: ["expand", "collapse"],
    eye: ["visible", "hidden"],
    code: ["code", "diff"],
    refresh: ["idle", "active"],
    chevron: ["collapsed", "expanded"],
    build: ["build", "stop"],
    search: ["idle", "focused"],
    settings: ["closed", "open"],
  };
  for (const [name, states] of Object.entries(required)) {
    assert.ok(name in MORPH_ICONS, `missing morph icon ${name}`);
    assert.deepEqual(morphStates(name as keyof typeof MORPH_ICONS), states, `${name} states`);
  }
});

test("every morph state has the same slots with identical command structure (so `d` interpolates, never swaps)", () => {
  for (const name of MORPH_ICON_NAMES) {
    const states = morphStates(name);
    const first = morphState(name, states[0]) as MorphStateDef;
    for (const st of states) {
      const def = morphState(name, st) as MorphStateDef;
      assert.equal(def.strokes.length, first.strokes.length, `${name}.${st} slot count`);
      def.strokes.forEach((s, i) => {
        assert.equal(pathSignature(s.d), pathSignature(first.strokes[i].d), `${name}.${st} slot ${i} structure`);
        if (s.opacity !== undefined) assert.ok(s.opacity >= 0 && s.opacity <= 1, `${name}.${st} slot ${i} opacity`);
      });
    }
  }
});

test("each morph pair actually changes geometry (or rotation / spin), so no state is a dead duplicate", () => {
  for (const name of MORPH_ICON_NAMES) {
    const states = morphStates(name);
    const keys = states.map((st) => {
      const d = morphState(name, st) as MorphStateDef;
      return JSON.stringify([d.strokes, d.rotate ?? 0, !!d.spin]);
    });
    assert.equal(new Set(keys).size, keys.length, `${name} has two identical states`);
  }
  // spin only on a state that means work in flight
  for (const name of MORPH_ICON_NAMES) {
    for (const st of morphStates(name)) {
      if ((morphState(name, st) as MorphStateDef).spin) assert.deepEqual([name, st], ["refresh", "active"]);
    }
  }
});

test("all icon geometry stays on the 24 grid inside a 1px safe margin", () => {
  const inGrid = (d: string, where: string) => {
    for (const [x, y] of pathPoints(d)) {
      if (!Number.isNaN(x)) assert.ok(x >= 1 && x <= 23, `${where}: x=${x}`);
      if (!Number.isNaN(y)) assert.ok(y >= 1 && y <= 23, `${where}: y=${y}`);
    }
  };
  for (const name of MORPH_ICON_NAMES) for (const st of morphStates(name)) (morphState(name, st) as MorphStateDef).strokes.forEach((s, i) => inGrid(s.d, `${name}.${st}[${i}]`));
  for (const name of ICON_NAMES) GLYPHS[name].forEach((d, i) => inGrid(d, `${name}[${i}]`));
});

test("static icon set covers what the Studio needs and every glyph parses", () => {
  const needed = [
    "attach", "image", "file", "folder", "history", "sessions", "settings", "viewport", "changes", "plan", "activity",
    "terminal", "warning", "error", "check", "credit", "link", "more", "drag-handle", "roblox-studio", "blender",
  ];
  for (const n of needed) assert.ok(n in GLYPHS, `missing static icon ${n}`);
  for (const name of ICON_NAMES) {
    assert.ok(GLYPHS[name].length > 0, name);
    for (const d of GLYPHS[name]) assert.doesNotThrow(() => parsePath(d), `${name}: ${d}`);
  }
});

test("UltimateMark core and rays interpolate between idle and active", () => {
  assert.ok(canInterpolate(ULTIMATE.core.idle, ULTIMATE.core.active));
  assert.notEqual(ULTIMATE.core.idle, ULTIMATE.core.active);
  assert.equal(ULTIMATE.rays.idle.length, ULTIMATE.rays.active.length);
  ULTIMATE.rays.idle.forEach((d, i) => assert.ok(canInterpolate(d, ULTIMATE.rays.active[i]), `ray ${i}`));
  assert.ok(ULTIMATE.rings.inner.r < ULTIMATE.rings.outer.r && ULTIMATE.rings.outer.r <= 11);
});
