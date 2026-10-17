import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Light-mode polish + Lovable-style aura (src/styles/light.css, src/styles/aura.css and the light blocks in the home / app modules).
 *  - Every aura rule is scoped to the light theme; Dark (the Space theme, a black void #000) never defines or paints an aura.
 *  - The glow is static: no full-page animation, no viewport blur, no background-attachment. Colour is removed under increased contrast.
 *  - The warm light palette keeps WCAG AA for body inks.
 */
const root = new URL("../", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, root), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selector: string; body: string; at: string[] };
/** Tiny brace parser: flattens nested at-rules into rules that carry their at-rule context. */
function rules(css: string): Rule[] {
  const src = stripComments(css);
  const out: Rule[] = [];
  const stack: { head: string; at: boolean }[] = [];
  let buf = "";
  for (const ch of src) {
    if (ch === "{") {
      const head = buf.trim();
      buf = "";
      stack.push({ head, at: head.startsWith("@") && !head.startsWith("@font-face") });
    } else if (ch === "}") {
      const top = stack.pop();
      if (top && !top.at && !top.head.startsWith("@keyframes") && !stack.some((s) => s.head.startsWith("@keyframes"))) {
        out.push({ selector: top.head, body: buf.trim(), at: stack.filter((s) => s.at).map((s) => s.head) });
      }
      buf = "";
    } else buf += ch;
  }
  return out;
}
const LIGHT = /\[data-theme="light"\]/;

function cssFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(new URL(dir, root))) {
    const rel = join(dir, name);
    if (statSync(new URL(rel, root)).isDirectory()) cssFiles(rel, acc);
    else if (name.endsWith(".css")) acc.push(rel);
  }
  return acc;
}
const all = cssFiles("src").map((f) => ({ f, css: read(f) }));

test("aura tokens exist only under the light theme", () => {
  const aura = read("src/styles/aura.css");
  assert.ok(read("src/styles/globals.css").includes('@import "./aura.css";'), "aura.css is imported");
  const defs = rules(aura).filter((r) => /--aura-[\w-]+\s*:/.test(r.body));
  assert.ok(defs.length >= 2, "aura tokens are defined");
  for (const r of defs) assert.match(r.selector, LIGHT, `aura token defined outside light: ${r.selector}`);
  assert.doesNotMatch(stripComments(aura), /data-theme="dark"/, "aura.css never mentions the dark theme");
  for (const hue of ["peach", "violet", "cyan", "gold"]) assert.match(aura, new RegExp(`--aura-${hue}:`));
  assert.doesNotMatch(stripComments(aura), /background-attachment|filter:\s*blur|@keyframes|animation:/);
});

test("every rule that paints an aura is scoped to light, sitewide", () => {
  let painters = 0;
  for (const { f, css } of all) {
    for (const r of rules(css)) {
      if (!/var\(--aura-(hero|soft|dock|welcome|corners|anim)\)/.test(r.body)) continue;
      if (!/background/.test(r.body)) continue;
      painters++;
      assert.match(r.selector, LIGHT, `${f}: "${r.selector}" uses an aura without the light-theme scope`);
      assert.match(r.body, /pointer-events:\s*none|animation:/, `${f}: aura layer must not take pointer events`);
    }
  }
  // Marketing only (the home close and the Monolith hero): the /app workspace keeps a calm, flat canvas in both themes.
  assert.ok(painters >= 2, `expected aura placements, found ${painters}`);
});

test("the /app workspace paints no aura and no backdrop art", () => {
  for (const { f, css } of all) {
    for (const r of rules(css)) {
      if (!/var\(--aura-/.test(r.body)) continue;
      assert.doesNotMatch(r.selector, /App-module__|studio-module__|Composer-module__/, `${f}: "${r.selector}" paints an aura inside the app`);
      assert.doesNotMatch(f, /app-ui/, `${f}: the app's own styles never use the aura`);
    }
  }
});

test("dark theme defines and paints no aura", () => {
  for (const { f, css } of all) {
    for (const r of rules(css)) {
      if (!/data-theme="dark"|html:not\(\[data-theme="light"\]\)/.test(r.selector)) continue;
      assert.doesNotMatch(r.body, /--aura-|var\(--aura-/, `${f}: dark rule "${r.selector}" touches the aura`);
    }
  }
  // and the dark canvas is the Space void (Space UI, docs/design/space-ui.md: the star field, not an aura, lives behind it)
  assert.match(read("src/styles/tokens.css"), /:root\[data-theme="dark"\]\s*\{[^}]*--c-canvas:\s*#000000/);
  // the home scene stays the opaque night sky in dark; it is only transparent (over the aura) in light
  const home = read("src/components/home/MonolithHome.tsx");
  assert.match(home, /opaque:\s*sceneTheme === "dark"/);
});

test("the aura stays static: no drift, no viewport blur, no background-attachment; colour off under increased contrast", () => {
  const aura = stripComments(read("src/styles/aura.css"));
  assert.match(aura, /--aura-anim:\s*none/);
  assert.match(aura, /--aura-blur:\s*0px/);
  assert.doesNotMatch(aura, /@keyframes|background-attachment|filter:\s*blur/);
  const hc = rules(aura).filter((r) => r.at.some((a) => /prefers-contrast:\s*more/.test(a)));
  assert.ok(hc.some((r) => /--aura-hero:\s*none/.test(r.body) && /--aura-soft:\s*none/.test(r.body)), "increased contrast removes the aura");
  for (const { f, css } of all) {
    const plain = stripComments(css);
    assert.doesNotMatch(plain, /animation:\s*var\(--aura-anim\)/, `${f}: aura must not animate`);
    assert.doesNotMatch(plain, /filter:\s*blur\(\s*var\(--aura-blur\)\s*\)/, `${f}: aura must not blur a layer`);
    assert.doesNotMatch(plain, /background-attachment/, `${f}: aura must not use background-attachment`);
  }
  assert.doesNotMatch(aura, /App-module__/, "no aura layer behind the app's main column");
});

test("light palette: cool off-white canvas and AA inks", () => {
  const light = stripComments(read("src/styles/light.css"));
  const block = light.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/);
  assert.ok(block);
  const v = (name: string) => {
    const m = block[1].match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"));
    assert.ok(m, `${name} is a hex colour`);
    return m[1];
  };
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  assert.equal(v("--c-canvas").toLowerCase(), "#f7f8fa");
  for (const bg of ["--c-canvas", "--c-surface-1", "--c-surface-2"]) {
    for (const ink of ["--c-ink", "--c-ink-2", "--c-ink-3"]) {
      const r = ratio(v(ink), v(bg));
      assert.ok(r >= 4.5, `${ink} on ${bg} = ${r.toFixed(2)}:1 (needs 4.5)`);
    }
  }
  // the light block never redefines dark tokens; Light stays a full theme, though Dark (the Space theme) is now the default
  assert.doesNotMatch(light, /data-theme="dark"/);
  assert.match(read("src/lib/theme.ts"), /DEFAULT_THEME_PREF: ThemePref = "dark"/);
});
