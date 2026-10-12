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

test("Settings CSS: secondary buttons are declared after the primary glass override, and the tab row is one swipeable line on phones", () => {
  const css = read("src/components/account/account.module.css");
  assert.ok(css.lastIndexOf(".btn.btnGhost {") > css.indexOf("glass buttons"), ".btnGhost must win over the glass .btn background");
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.settingsNav \{ flex-wrap: nowrap; overflow-x: auto/);
});

test("Plan & billing: admin accounts get plain wording, no billing period, and admin links", () => {
  const page = read("src/app/(marketing)/account/page.tsx");
  assert.doesNotMatch(page, /Not applicable/);
  assert.match(page, /No subscription needed/);
  assert.doesNotMatch(page, /Daily safety cap/);
  assert.match(page, /ws\.admin \? "Unlimited"/);
  assert.match(page, /ws\.admin \? \(\s*<div className=\{s\.row\}><span className=\{s\.k\}>Billing</);
  const actions = read("src/components/account/AccountActions.tsx");
  assert.match(actions, /href="\/admin"/);
  assert.match(actions, /Manage billing &amp; invoices|Manage billing & invoices/);
});

test("Settings tabs: pills (Oct 2026 canvas design), constant label weight, and selecting never scrolls the window by accident", () => {
  const css = read("src/components/account/account.module.css");
  assert.match(css, /\.settingsChip\.settingsChip \{ border-radius: 999px; \}/, "category tabs are pills in the redesign");
  assert.match(css, /\.settingsChip\.settingsChip\[data-on\] \{[^}]*background: var\(--c-ink\)/);
  const chip = css.match(/\.settingsChip \{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(chip, /var\(--r-pill\)/);
  assert.match(chip, /font-weight: var\(--w-medium\)/, "same weight active or not, so chips do not change width on selection");
  assert.doesNotMatch(css, /\.settingsChip\[data-on\][^}]*font-weight/);
  const src = read("src/components/account/SettingsSections.tsx");
  assert.doesNotMatch(src, /tabRefs\.current\[active\]\?\.scrollIntoView/, "Element.scrollIntoView scrolls the window and un-sticks the tab bar");
  assert.match(src, /focus\(\{ preventScroll: true \}\)/);
  assert.match(src, /strip\.scrollTo\(/);
});

test("Settings tabs: never paint a solid/blurred page-coloured band behind the pills — transparent even while sticky", () => {
  const css = read("src/components/account/account.module.css");
  const wrap = css.match(/\.settingsTabsWrap \{[^}]*\}/)?.[0] ?? "";
  assert.match(wrap, /background: transparent/);
  assert.doesNotMatch(wrap, /backdrop-filter|rgb\(var\(--rgb-canvas\)/);
  assert.doesNotMatch(css, /\.settingsTabsWrap\[data-stuck\]/, "no stuck-state fill — the black rectangle must stay gone");
  assert.doesNotMatch(css, /\.settingsTabsWrap[^{\n]*\{[^}]*backdrop-filter/);
  assert.doesNotMatch(css, /\.settingsChip:hover \{[^}]*background: rgb/, "hover must not paint a fill on inactive tabs");
  assert.match(css, /\.settingsChip\.settingsChip\[data-on\] \{[^}]*background: var\(--c-ink\)/, "selected pill keeps its fill");
  const src = read("src/components/account/SettingsSections.tsx");
  assert.doesNotMatch(src, /data-stuck|setStuck/);
});
