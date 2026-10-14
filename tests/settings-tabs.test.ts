import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("Settings: categories are real tabs with an active state, search covers panel text, deep links open their panel", () => {
  const src = read("src/components/account/SettingsSections.tsx");
  assert.match(src, /role="tablist"/);
  assert.match(src, /role="tab"/);
  assert.match(src, /aria-selected=/);
  assert.match(src, /role="tabpanel"/);
  assert.match(src, /hashchange/);
  assert.match(src, /closest<HTMLElement>\("\[data-sec\]"\)/);
  assert.match(src, /textContent/);
});

test("Settings CSS: secondary buttons are declared after the ink primary, no glass, and the category rail is one swipeable line on phones", () => {
  const css = read("src/components/account/account.module.css");
  assert.ok(css.lastIndexOf(".btn.btnGhost {") > css.indexOf(".btn {"), ".btnGhost must win over the ink .btn background");
  assert.match(css.match(/\.btn \{[^}]*\}/)?.[0] ?? "", /background: var\(--c-ink\)/, "the primary is the ink pill (docs/ui-v2.md)");
  assert.doesNotMatch(css, /backdrop-filter|--btn-|--lt-|#[0-9a-fA-F]{3,8}\b|rgba?\(\d/, "UI v2: tokens only, no glass");
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.settingsNav \{ flex-direction: row; overflow-x: auto/);
});

test("Plan & billing: admin accounts get plain wording, no billing period, and admin links", () => {
  const page = read("src/components/account/AccountSettings.tsx");
  assert.doesNotMatch(page, /Not applicable/);
  assert.match(page, /No subscription needed/);
  assert.doesNotMatch(page, /Daily safety cap/);
  assert.match(page, /ws\.admin \? "Unlimited"/);
  assert.match(page, /ws\.admin \? \(\s*<div className=\{s\.row\}><span className=\{s\.k\}>Billing</);
  const actions = read("src/components/account/AccountActions.tsx");
  assert.match(actions, /href="\/admin"/);
  assert.match(actions, /Manage billing &amp; invoices|Manage billing & invoices/);
});

test("Settings window: a dialog over the app via an intercepted route, the same window alone at /account", () => {
  const layout = read("src/app/app/layout.tsx");
  assert.match(layout, /modal: React\.ReactNode/);
  assert.match(layout, /\{modal\}/);
  assert.match(read("src/app/app/@modal/(..)account/page.tsx"), /<AccountSettings mode="modal"/);
  assert.match(read("src/app/app/@modal/default.tsx"), /return null/);
  assert.match(read("src/app/app/@modal/[...rest]/page.tsx"), /return null/, "navigating elsewhere in the app closes the dialog");
  assert.match(read("src/app/(marketing)/account/page.tsx"), /<AccountSettings mode="page"/);
  const dlg = read("src/components/account/SettingsDialog.tsx");
  assert.match(dlg, /role=\{modal \? "dialog" : undefined\}/);
  assert.match(dlg, /aria-modal/);
  assert.match(dlg, /e\.key === "Escape" && !e\.defaultPrevented/, "Esc closes unless an inner control used it (search clear)");
  assert.match(dlg, /router\.back\(\)/);
});

test("Settings rail: rows with constant label weight, and selecting never scrolls the page behind", () => {
  const css = read("src/components/account/account.module.css");
  assert.match(css, /\.navItem\.navItem \{ border-radius: var\(--r-xs\); \}/, "rounded rows, not pills");
  const chip = css.match(/\.navItem \{[^}]*\}/)?.[0] ?? "";
  assert.match(chip, /font-weight: var\(--w-medium\)/, "same weight active or not, so rows do not change width on selection");
  assert.doesNotMatch(css, /\.navItem[^{]*\[data-on\][^}]*font-weight/);
  const src = read("src/components/account/SettingsSections.tsx");
  assert.doesNotMatch(src, /tabRefs\.current\[active\]\?\.scrollIntoView/, "Element.scrollIntoView would scroll the page too");
  assert.match(src, /focus\(\{ preventScroll: true \}\)/);
  assert.match(src, /strip\.scrollTo\(/);
  assert.match(src, /replaceState\(window\.history\.state/, "keeps Next's history state so closing the dialog goes back correctly");
});

test("Device prefs: applied before paint, saved only when not default, and wired where they act", () => {
  const prefs = read("src/lib/prefs.ts");
  assert.match(read("src/app/layout.tsx"), /__html: PREFS_SCRIPT/);
  assert.match(read("src/styles/globals.css"), /@import "\.\/prefs\.css";/);
  assert.match(prefs, /filter\(\(\[k, v\]\) => v !== PREF_DEFAULTS/);
  assert.match(read("src/components/app-ui/Composer.tsx"), /prefs\.sendKey === "mod-enter"/);
  assert.match(read("src/components/app-ui/Composer.tsx"), /spellCheck=\{prefs\.spellcheck\}/);
  const app = read("src/components/app-ui/KeplarApp.tsx");
  assert.match(app, /followRef\.current/);
  assert.match(app, /prefs\.notifyDone && document\.hidden/);
  assert.match(app, /e\.key === ","[\s\S]{0,80}router\.push\("\/account"\)/, "Ctrl/⌘+, opens Settings");
  const css = read("src/styles/prefs.css");
  for (const a of ["text-size", "font", "code-wrap", "reduce-motion", "contrast", "underline-links", "focus-rings"]) assert.match(css, new RegExp(`data-pref-${a}`));
  assert.match(read("src/components/app-ui/App.module.css"), /data-pref-chat-width="wide"/);
});
