import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitSize, FIT_MIN_PX } from "@/lib/fit-text";

test("text that fits is left alone", () => {
  assert.deepEqual(fitSize({ avail: 200, needed: 180, current: 14 }), { size: 14, fits: true });
  assert.deepEqual(fitSize({ avail: 200, needed: 200.4, current: 14 }), { size: 14, fits: true });
});
test("too-wide text scales down proportionally and really fits", () => {
  const r = fitSize({ avail: 120, needed: 150, current: 16 });
  assert.ok(r.fits && r.size < 16 && r.size >= 12.5);
  assert.ok(150 * (r.size / 16) <= 120 + 0.5);
});
test("never below the minimum: then it reports it does not fit (ellipsis + tooltip take over)", () => {
  const r = fitSize({ avail: 60, needed: 240, current: 14 });
  assert.equal(r.size, FIT_MIN_PX);
  assert.equal(r.fits, false);
  // already smaller than the minimum: never scaled up
  assert.equal(fitSize({ avail: 20, needed: 80, current: 9 }).size, 9);
  assert.ok(fitSize({ avail: 0, needed: 80, current: 9 }).fits, "an unmeasurable box is not touched");
});
test("minimum can be lowered for dense UI", () => {
  const r = fitSize({ avail: 100, needed: 150, current: 12, min: 8 });
  assert.ok(r.fits && r.size >= 8 && r.size < 12);
});

test("shared primitives use the fit mechanism by default", () => {
  assert.match(readFileSync("src/components/ui/Button.tsx", "utf8"), /data-fit=""/);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /<FitRuntime \/>/);
  assert.match(readFileSync("src/styles/globals.css", "utf8"), /fit\.css/);
  const css = readFileSync("src/styles/fit.css", "utf8");
  assert.match(css, /min-width: 0/);
  assert.match(css, /overflow-wrap: break-word/);
  assert.match(css, /data-fit-state="ellipsis"/);
});

test("template cards: title and mini nav scale with the card and whole items drop instead of a word being cut", () => {
  const css = readFileSync("src/components/create/workspace/ws.module.css", "utf8");
  const pages = css.slice(css.indexOf(".thumbPages {"), css.indexOf(".thumbPages {") + 520);
  assert.match(css, /\.thumb \{ container-type: inline-size/);
  assert.match(css, /\.thumbName \{ font-size: clamp\(.*cqi/);
  assert.match(pages, /flex-wrap: wrap/);
  assert.match(pages, /height: 1\.5em/);
  assert.ok(!/text-overflow: ellipsis/.test(pages), "mini nav never ends in an ellipsis");
  assert.match(readFileSync("src/components/create/SiteBuilder.tsx", "utf8"), /pages\.slice\(0, 4\)\.map\(\(p\) => <span key=\{p\}>/);
});
