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

test("phones: the localized home's copy has readable floors (it was 7.5 to 9.5px) and the message box is 16px (no iPhone zoom)", () => {
  const b = block(css("src/components/home/MonolithHome.module.css"), "max-width: 760px", ".sub { font-size: 15px");
  assert.ok(b, "mobile floor block exists");
  for (const n of px(b)) assert.ok(n >= 12, `no phone text under 12px (found ${n})`);
  assert.match(b, /\.input \{ font-size: 16px; \}/);
  for (const sel of [".sub", ".note", ".fine", ".kicker", ".nodes li", ".proof", ".body", ".steps li", ".link", ".go"]) assert.ok(b.includes(sel), sel);
});

test("phones: the header fits on one line in every language (menu becomes a circle, nothing shrinks or wraps, theme moves into the menu)", () => {
  const nav = css("src/components/chrome/Nav.module.css");
  const narrow = block(nav, "max-width: 480px", ".morph:not([data-open])");
  assert.match(narrow, /\.morph:not\(\[data-open\]\) \{ width: 52px; \}/);
  assert.match(narrow, /\.toggleLabel \{ position: absolute;[^}]*clip-path: inset\(50%\)/, "label hidden visually, still read out");
  assert.match(narrow, /\.theme \{ flex: none; \}/);
  assert.match(narrow, /\.cta \{ white-space: nowrap;/);
  assert.match(block(nav, "max-width: 400px", ".panelTheme"), /\.actions \.theme \{ display: none; \}[\s\S]*\.panelTheme \{ display: inline-grid; \}/);
  const tsx = readFileSync("src/components/chrome/Nav.tsx", "utf8");
  assert.match(tsx, /<ThemeToggle className=\{`\$\{s\.theme\} \$\{s\.panelTheme\}`\} \/>/, "the theme switch is still reachable on small phones");
  assert.match(tsx, /aria-label=\{open \? t\.closeMenu : t\.openMenu\}/, "the icon-only menu button keeps its name");
});

test("touch: small controls are at least 36-44px tall; <small> never under 12px on a phone", () => {
  assert.match(block(css("src/components/i18n/LocaleSuggest.module.css"), "pointer: coarse", ".go, .no"), /min-height: 44px/);
  assert.match(block(css("src/components/i18n/LanguagePicker.module.css"), "pointer: coarse", ".trigger"), /min-height: 44px/);
  assert.match(block(css("src/components/kb/kb.module.css"), "pointer: coarse", ".copy"), /\.copy \{ min-height: 36px;/);
  assert.match(block(css("src/styles/globals.css"), "max-width: 760px", "small {"), /small \{ font-size: max\(0\.75rem, 0\.8333em\); \}/);
  assert.doesNotMatch(css("src/components/developers/Developers.module.css"), /font-size: 11px/, "developer labels use the label token");
});
