import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { askProgress, profileFor } from "../src/field/profile";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("field renders tiny hard-edged points: no soft sprites, no tubes, no bloom plane, built on load", () => {
  const g = read("src/field/glsl.ts");
  assert.match(g, /POINT_FRAG/);
  assert.match(g, /uBuild/);
  assert.match(g, /assemble/);
  assert.doesNotMatch(g, /smoothstep\(0\.5, 0\.0/); // the old radial soft-sprite falloff
  assert.doesNotMatch(g, /RIBBON|TubeGeometry|PlaneGeometry/);
  const e = read("src/field/engine.ts");
  assert.doesNotMatch(e, /TubeGeometry|buildRibbons|buildPlane|UnrealBloom/);
  assert.match(e, /antialias: o.quality !== "low"/);
  assert.match(e, /setAsk/);
  assert.match(e, /setEnergy/);
});

test("page-wide layer: every page except home and user content, admin kept faint and capped, reactive only where it is safe", () => {
  assert.equal(profileFor("/"), null);
  for (const p of ["/sites/x", "/s/abc", "/i/abc", "/api/health", "/embed/x", "/create-preview"]) assert.equal(profileFor(p), null, p);
  for (const p of ["/pricing", "/how-it-works", "/signin", "/legal/terms", "/for-you", "/enterprise"]) assert.equal(profileFor(p)?.id, "marketing", p);
  assert.equal(profileFor("/app")?.id, "app");
  assert.equal(profileFor("/app/")?.reactive, true);
  const admin = profileFor("/admin/ops");
  assert.equal(admin?.id, "admin");
  assert.equal(admin?.reactive, false);
  assert.equal(admin?.fpsCap, 30);
  assert.ok((admin?.opacity ?? 1) <= 0.25 && (admin?.density ?? 1) <= 0.5);
});

test("answer progress comes only from real run state and stays within bounds", () => {
  assert.equal(askProgress(0, 0, 0, 0), 0.04);
  assert.ok(askProgress(1, 4, 0, 3) > askProgress(0, 4, 0, 3));
  assert.ok(askProgress(0, 4, 3, 3) > askProgress(0, 4, 1, 3));
  assert.ok(askProgress(4, 4, 3, 3) <= 0.97);
});

test("the layer is wired: mounted once in the root layout, behind content, inert, with reduced-motion/data-saver only lowering the tier or slowing the drift", () => {
  assert.match(read("src/app/layout.tsx"), /<LegacyDecor \/>/);
  assert.match(read("src/components/chrome/LegacyDecor.tsx"), /<PageMonolith \/>/);
  assert.doesNotMatch(read("src/app/layout.tsx"), /<PageMonolith \/>/);
  const css = read("src/styles/field.css");
  assert.match(css, /\.pagefield[^}]*pointer-events: none/s);
  assert.match(css, /z-index: -1/);
  const c = read("src/components/field/PageField.tsx");
  assert.match(c, /setAttribute\("aria-hidden", "true"\)/);
  assert.match(c, /resolveTier/);
  assert.doesNotMatch(c, /quality === "off"/);
  assert.match(c, /setAsk/);
  assert.match(c, /setEnergy/);
  assert.doesNotMatch(c, /holdTyping/); // the layer never holds still: motion is GPU-side and the renderer is off the main thread
  const app = read("src/components/app-ui/KeplarApp.tsx");
  assert.match(app, /FIELD_EVENT/);
  assert.match(app, /askProgress/);
  assert.match(read("src/components/app-ui/App.module.css"), /html\[data-field-ask\]\) \.sideWrap/);
});
