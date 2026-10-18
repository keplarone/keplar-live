import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = (f: string) => readFileSync(f, "utf8");
/** The rules inside the first `@media (<query>)` block that contains `marker`. */
const block = (src: string, query: string, marker: string) => {
  let i = src.indexOf(`@media (${query})`);
  while (i >= 0) {
    const body = src.slice(i, src.indexOf("\n}", i) + 2);
    if (body.includes(marker)) return body;
    i = src.indexOf(`@media (${query})`, i + 1);
  }
  return "";
};
const px = (s: string) => [...s.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));

test("phones: label text is 12px (the fluid scale gave 11px), in rem so the person's text size still applies", () => {
  const b = block(css("src/styles/tokens.css"), "max-width: 760px", "--t-label");
  assert.match(b, /--t-label: 0\.75rem;/);
});

test("phones: the overview copy stays readable and the chat box is 16px (no iPhone zoom)", () => {
  const overview = css("src/components/marketing/Overview.module.css");
  for (const n of px(overview)) assert.ok(n >= 15, `no overview text under 15px (found ${n})`);
  assert.match(css("src/components/app-ui/Composer.module.css"), /\.input \{ font-size: 16px; \}/);
});

test("phones: the header fits on one line in every language (search and Sign in move into the menu sheet, theme too under 400px)", () => {
  const nav = css("src/components/chrome/Nav.module.css");
  const phone = block(nav, "max-width: 640px", ".searchBtn");
  assert.match(phone, /\.searchBtn, \.signIn \{ display: none; \}/);
  assert.match(phone, /\.sheetSignIn \{ display: inline-flex; \}/);
  assert.match(nav, /\.cta \{[^}]*white-space: nowrap;/);
  assert.match(block(nav, "max-width: 400px", ".panelTheme"), /\.actions \.theme \{ display: none; \}[\s\S]*\.panelTheme \{ display: inline-grid; \}/);
  const tsx = readFileSync("src/components/chrome/Nav.tsx", "utf8");
  assert.match(tsx, /<ThemeToggle className=\{`\$\{s\.icon\} \$\{s\.theme\} \$\{s\.panelTheme\}`\} \/>/, "the theme switch is still reachable on small phones");
  assert.match(tsx, /aria-label=\{open \? t\.closeMenu : t\.openMenu\}/, "the icon-only menu button keeps its name");
});

test("touch: small controls are at least 36-44px tall; <small> never under 12px on a phone", () => {
  assert.match(block(css("src/components/i18n/LocaleSuggest.module.css"), "pointer: coarse", ".go, .no"), /min-height: 44px/);
  assert.match(block(css("src/components/i18n/LanguagePicker.module.css"), "pointer: coarse", ".trigger"), /min-height: 44px/);
  assert.match(block(css("src/components/kb/kb.module.css"), "pointer: coarse", ".copy"), /\.copy \{ min-height: 36px;/);
  assert.match(block(css("src/styles/globals.css"), "max-width: 760px", "small {"), /small \{ font-size: max\(0\.75rem, 0\.8333em\); \}/);
  assert.doesNotMatch(css("src/components/developers/Developers.module.css"), /font-size: 11px/, "developer labels use the label token");
});
