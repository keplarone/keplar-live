import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { greetName } from "../src/lib/onboarding/greet";

const read = (f: string) => readFileSync(f, "utf8");

test("greeting: only a clean first name is used, anything else falls back to no name", () => {
  assert.equal(greetName("Alex Rivera"), "Alex");
  assert.equal(greetName("  Zoë  "), "Zoë");
  assert.equal(greetName("Jean-Luc"), "Jean-Luc");
  assert.equal(greetName("O'Brien"), "O'Brien");
  assert.equal(greetName("María José"), "María");
  for (const bad of ["xe0se", "user123", "a", "", "   ", null, undefined, "me@example.com", "<b>x</b>", "12345", "___", "x".repeat(40)]) assert.equal(greetName(bad as string), null, String(bad));
  const ob = read("src/components/onboarding/AppOnboarding.tsx");
  assert.match(ob, /greetName\(data\.name\)/);
  assert.doesNotMatch(ob, /data\.name\.split/);
});

test("import prompt: roomy padding, labels never wrap, equal pills that stack when the sidebar is narrow", () => {
  const css = read("src/components/app-ui/AccountMenu.module.css");
  const imp = css.match(/\.import \{[^}]*\}/)![0];
  assert.match(imp, /padding: var\(--s-4\)/);
  const row = css.match(/\.row \{[^}]*\}/)![0];
  assert.match(row, /flex-wrap: wrap/);
  const btn = css.match(/\n\.btn \{[^}]*\}/)![0];
  assert.match(btn, /white-space: nowrap/);
  assert.match(btn, /min-width: max-content/);
  assert.match(btn, /min-height: 40px/);
});

test("first-question card: equal-height starters, nowrap pills, wrapping action row", () => {
  const css = read("src/components/onboarding/app-onboarding.module.css");
  assert.match(css, /\.starters \{[^}]*grid-auto-rows: 1fr/);
  assert.match(css, /\.starters > li \{ display: flex/);
  assert.match(css, /\.btn \{[^}]*white-space: nowrap/);
  assert.match(css, /\.actions \{[^}]*flex-wrap: wrap/);
});

test("app: the composer dock floats as an overlay over the thread; one-row grid exactly the viewport tall", () => {
  const css = read("src/components/app-ui/App.module.css");
  assert.match(css, /\.app \{[^}]*grid-template-rows: minmax\(0, 1fr\)/);
  assert.match(css, /\.app \{[^}]*overflow: hidden/);
  // Overlay dock (feat ask overlay): absolute over .main; --dock-h pads .scroll and .jump so last turns stay clear.
  assert.match(css, /\.dock \{[^}]*position: absolute/);
  assert.doesNotMatch(css, /\.dock \{[^}]*position: relative;[^}]*flex: none/);
  assert.match(css, /\.scroll \{[^}]*padding: 72px var\(--s-6\) calc\(var\(--dock-h, 160px\) \+ var\(--s-4\)\)/);
  assert.match(css, /\.jump \{[^}]*bottom: calc\(var\(--dock-h/);
  const hook = read("src/components/app-ui/dock-height.ts");
  assert.match(hook, /ResizeObserver/);
  assert.match(hook, /--dock-h/);
  // A callback ref, so a dock remounted after Create / Slides / Study is measured again (a mount-once effect left --dock-h at 0px).
  assert.match(hook, /useCallback\(\(el: T \| null\)/);
  assert.match(hook, /box: "border-box"/);
  const app = read("src/components/app-ui/KeplarApp.tsx");
  assert.match(app, /useDockHeight/);
  assert.match(app, /ref=\{dockRef\}\s+className=\{s\.dock\}/);
});

test("home hero: type and spacing follow the viewport height, short windows scroll the hero instead of clipping it", () => {
  const css = read("src/components/home/FieldHome.module.css");
  assert.match(css, /\.h1 \{[^}]*min\(6\.4vw, 8\.6vh\)/);
  assert.match(css, /justify-content: safe center/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /@media \(max-height: 960px\)/);
});

test("layout regression check exists and covers the viewports in question", () => {
  const e2e = read("scripts/layout-e2e.mjs");
  for (const vp of ["1366, 768", "1536, 864, 1.25", "1280, 720, 1.5", "2560, 1440", "3440, 1440", "390, 844", "640, 360"]) assert.ok(e2e.includes(vp), vp);
  assert.match(e2e, /hero inside the first screen/);
  assert.match(e2e, /pill labels on one line/);
});

test("onboarding: an odd last starter card spans the row", () => {
  const css = read("src/components/onboarding/app-onboarding.module.css");
  assert.match(css, /\.starters > li:last-child:nth-child\(odd\) \{ grid-column: 1 \/ -1; \}/);
});

test("e2e: the layout script signs in (local PGlite server) and checks the composer on /app at the Windows viewports", () => {
  const e2e = read("scripts/layout-e2e.mjs");
  for (const vp of ["1366, 768, 1", "1536, 864, 1.25", "1920, 1080, 1", "1280, 720, 1.5"]) assert.ok(e2e.includes(`[${vp}]`), vp);
  assert.match(e2e, /\/dev\/outbox/);
  assert.match(e2e, /composer fully inside the viewport/);
  assert.match(e2e, /composer dock pinned to the bottom/);
  assert.match(e2e, /clears the dock/);
  const sh = read("scripts/e2e-server.sh");
  assert.match(sh, /fake-neon-preload\.cjs/);
  assert.match(sh, /KEPLAR_DEV_TOOLS=1/);
  assert.match(read("scripts/fake-neon-preload.cjs"), /pglite/i);
});
