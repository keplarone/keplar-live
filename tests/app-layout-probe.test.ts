/**
 * Generated-app layout checks found while recording marketing videos: the yoga app (Prana & Clay) spilled sideways at 540 px
 * while `html, body { overflow-x: hidden }` hid it from the build's old 390 px scrollWidth check, and the budget app's
 * absolutely positioned "FOLIO" mark sat on the "NON-COMMINGLED CAPITAL" header text. The build's browser test now runs
 * LAYOUT_PROBE at 390 and 540 px and on every route, and the generator is told the rules. The probe tests run in real Chromium
 * when one is installed (skipped otherwise); the fixtures reproduce both apps' CSS.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LAYOUT_PROBE, type LayoutProbeResult } from "@/lib/app-builder/verify/layout-probe";
import { rubricFindings, RUBRIC } from "@/lib/app-builder/rubric";

const YOGA = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box} html,body{overflow-x:hidden;max-width:100vw;margin:0;font:16px/1.4 sans-serif}
main{padding:15px} .strip{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between}
.group{display:flex;gap:.45rem;overflow-x:auto} .btn{white-space:nowrap;padding:8px 14px;border:1px solid #999;border-radius:99px;background:none}
.days{display:flex;gap:8px;overflow-x:auto;max-width:100%} .day{flex:1;min-width:86px}
@media (max-width:720px){.strip{flex-direction:column;align-items:flex-start}}
</style></head><body><main><nav class="days">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<button class="day">${d}</button>`).join("")}</nav>
<div class="strip"><div class="group">${["All", "Vinyasa Flow", "Slow Burn", "Yin & Sound", "Pranayama & Restore", "Ashtanga Primary"].map((s) => `<button class="btn">${s}</button>`).join("")}</div><select><option>All teachers</option></select></div>
<p style="max-width:300px">Begin with a <strong>Slow Burn</strong> or <strong>Pranayama &amp; Restore</strong> session to acquaint yourself with our tradition.</p>
</main></body></html>`;

const BUDGET = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;font:12px/1.4 monospace} .mast{position:relative;text-align:center;padding:16px 24px}
.top{display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:.1em}
.folio{position:absolute;top:16px;right:24px;text-transform:uppercase;letter-spacing:.1em}
.ghost{position:absolute;top:40px;left:24px;font-size:120px;opacity:.06}
.toast{position:fixed;left:24px;top:16px}
</style></head><body><section class="mast"><div class="top"><span>Vol. IV</span><span>Double-entry dispatch</span><span>Non-commingled capital</span></div>
<span class="ghost">04</span><h1>The Broadsheet Ledger</h1><span class="folio">Folio • MMXXVI</span></section><div class="toast">Saved</div></body></html>`;

const FIXED = (html: string) =>
  html
    .replace("html,body{overflow-x:hidden;max-width:100vw;margin:0;", "body{margin:0;")
    .replace(".group{display:flex;", ".group{display:flex;max-width:100%;min-width:0;")
    .replace(".folio{position:absolute;top:16px;right:24px;", ".folio{display:block;margin-top:8px;");

async function run(html: string, widths: number[]): Promise<LayoutProbeResult[] | null> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return null;
  }
  const browser = await chromium.launch({ headless: true }).catch(() => null);
  if (!browser) return null;
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    const out: LayoutProbeResult[] = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      out.push((await page.evaluate(LAYOUT_PROBE)) as LayoutProbeResult);
    }
    return out;
  } finally {
    await browser.close();
  }
}

test("probe: sideways overflow hidden by html/body overflow-x: hidden is still caught at 390 and 540, and named", async (t) => {
  const r = await run(YOGA, [390, 540, 1024]);
  if (!r) return t.skip("no local Chromium");
  const [p390, p540, p1024] = r;
  assert.equal(p540.overflow, true);
  assert.ok(p540.contentWidth > 540, String(p540.contentWidth));
  assert.match(p540.wide.join(" "), /<div class="group"> ends at \d+px/);
  assert.equal(p390.overflow, true);
  assert.equal(p1024.overflow, false, "fits on a wide screen");
  assert.ok(!p540.wide.some((w) => /class="day"/.test(w)), "a horizontal scroller that itself fits is fine");
  assert.deepEqual(p540.overlaps, [], "inline phrases that wrap inside one paragraph are not an overlap");
  const fixed = await run(FIXED(YOGA), [390, 540]);
  for (const p of fixed!) assert.equal(p.overflow, false, JSON.stringify(p));
});

test("probe: text on text is caught (absolute corner label), ghost numerals and fixed toasts are not", async (t) => {
  const r = await run(BUDGET, [960, 1920]);
  if (!r) return t.skip("no local Chromium");
  for (const p of r) {
    assert.equal(p.overlaps.length, 1, JSON.stringify(p.overlaps));
    assert.match(p.overlaps[0], /"Non-commingled capital" <span> and "Folio • MMXXVI" <span class="folio">/);
  }
  const fixed = await run(FIXED(BUDGET), [960, 1920]);
  for (const p of fixed!) assert.deepEqual(p.overlaps, []);
});

test("build browser test: phone passes at 390 and 540 px with the probe, overlap checked on every route", () => {
  const src = readFileSync("src/lib/app-builder/verify/smoke.ts", "utf8");
  assert.match(src, /for \(const width of \[390, 540\]\)/);
  assert.match(src, /page\.evaluate\(LAYOUT_PROBE\)/);
  assert.match(src, /if \(lp\?\.overlaps\.length\) issues\.push\(\{ route: label, message: overlapIssue\(lp\) \}\)/);
  assert.doesNotMatch(src, /overflow: document\.documentElement\.scrollWidth > window\.innerWidth \+ 1/, "the maskable check is gone");
});

test("generator rules: widths 320-1920, scrollers constrained, no overflow mask, no text over text", () => {
  assert.match(RUBRIC, /from 320px to 1920px \(390 and 540 are tested\)/);
  assert.match(RUBRIC, /max-width: 100%; min-width: 0/);
  assert.match(RUBRIC, /Never hide overflow with overflow-x: hidden on html or body/);
  assert.match(RUBRIC, /Text never sits on other text/);
  const warn = (css: string) => rubricFindings({ "styles.css": css }).some((f) => f.code === "overflow-mask");
  assert.equal(warn("html, body {\n  overflow-x: hidden;\n  max-width: 100vw;\n}"), true);
  assert.equal(warn("body{margin:0;overflow-x:clip}"), true);
  assert.equal(warn("html,body{overflow:hidden}"), false, "full-screen games may lock both axes");
  assert.equal(warn("body.modal-open{overflow-x:hidden}"), false);
  assert.equal(warn(".strip{overflow-x:hidden}"), false);
});
