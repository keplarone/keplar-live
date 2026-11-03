import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The open select menu lost its edge: SelectMenus copied --g-menu-shadow (none on keplar.one) into --ks-shadow,
 * and select-menu.css wrote `box-shadow: var(--ks-shadow), 0 0 0 1px …`. `none` is not a shadow in a list, so the
 * declaration is invalid and the browser drops it. The menu (#2f2f2f dark, #ececec light) then matches the form.
 * The edge is a 1px solid graphite border in both schemes. No glow, no blue, no purple, no gradient.
 */

const css = () => readFileSync("src/styles/select-menu.css", "utf8");
const menu = () => readFileSync("src/components/ui/SelectMenus.tsx", "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "");

test("select menu edge is a 1px graphite border and does not compose a shadow with none", () => {
  const src = strip(css());
  const dark = src.match(/\.ks-menu\s*\{([^}]*)\}/)?.[1] ?? "";
  const light = src.match(/\.ks-menu\[data-scheme="light"\]\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(dark, /border:\s*1px solid #8a8a8a/);
  assert.match(dark, /box-shadow:\s*none/);
  assert.match(light, /border-color:\s*#6e6e6e/);
  assert.match(light, /box-shadow:\s*none/);
  assert.doesNotMatch(src, /--ks-shadow|--g-menu-shadow/);
  assert.doesNotMatch(src, /box-shadow:\s*[^;]*none\s*,/);
  assert.doesNotMatch(src, /gradient|blur\(|drop-shadow|#(?:7c3aed|a855f7|9333ea|0071e3|2f6bff|2997ff|0a84ff|007aff)\b/i);
  for (const shadow of src.match(/box-shadow:\s*[^;]+/g) ?? []) {
    assert.equal(shadow.replace(/\s+/g, " ").trim(), "box-shadow: none");
  }
  const code = menu().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /--ks-shadow|--g-menu-shadow/);
});

test("a shadow list that starts with none is dropped, and the menu border still paints", async (t) => {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return t.skip("no local Chromium");
  }
  const browser = await chromium.launch({ headless: true }).catch(() => null);
  if (!browser) return t.skip("no local Chromium");
  try {
    const page = await browser.newPage();
    const sheet = css();
    await page.setContent(`<!doctype html><html data-theme="dark"><head><style>
      ${sheet}
      html[data-theme="dark"] { --g-menu-shadow: none; background: #212121; }
      html[data-theme="light"] { --g-menu-shadow: none; background: #ffffff; }
      .field { width: 280px; height: 48px; border: 0; border-radius: 12px; }
      html[data-theme="dark"] .field { background: #2f2f2f; }
      html[data-theme="light"] .field { background: #ececec; }
      .bad { box-shadow: var(--g-menu-shadow), 0 0 0 1px #8a8a8a; }
    </style></head><body>
      <div class="field"></div>
      <div class="ks-menu" id="dark" data-scheme="dark" style="position:relative; --ks-bg:#2f2f2f; --ks-shadow:none"><div class="ks-option">Account</div></div>
      <div class="ks-menu" id="light" data-scheme="light" style="position:relative; --ks-bg:#ececec; --ks-shadow:none"><div class="ks-option">Account</div></div>
      <div class="bad" id="bad"></div>
    </body></html>`);
    const read = (id: string) => page.$eval(id, (el) => {
      const cs = getComputedStyle(el);
      return { border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor, shadow: cs.boxShadow, bg: cs.backgroundColor };
    });
    const dark = await read("#dark");
    const light = await read("#light");
    const bad = await read("#bad");
    assert.equal(bad.shadow, "none", "none, 0 0 0 1px … is invalid and the browser drops the shadow");
    assert.equal(dark.border, "1px solid rgb(138, 138, 138)");
    assert.equal(dark.shadow, "none");
    assert.equal(dark.bg, "rgb(47, 47, 47)");
    assert.equal(light.border, "1px solid rgb(110, 110, 110)");
    assert.equal(light.shadow, "none");
    assert.equal(light.bg, "rgb(236, 236, 236)");

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    const lightAgain = await read("#light");
    assert.equal(lightAgain.border, "1px solid rgb(110, 110, 110)");
  } finally {
    await browser.close();
  }
});
