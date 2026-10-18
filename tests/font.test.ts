import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx?)$/.test(f)) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

test("font: Inter (variable, swap) via next/font/google on keplar.one; Space Studio keeps Montserrat; mono only for code", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import \{ Inter \} from "next\/font\/google"/);
  assert.match(layout, /Inter\(\{[\s\S]*display: "swap"[\s\S]*adjustFontFallback: true/);
  assert.doesNotMatch(layout, /Montserrat\(|IBM_Plex|Google_Sans|Lexend/);
  assert.match(read("src/app/(space)/layout.tsx"), /Montserrat\(\{[\s\S]*variable: "--font-space"[\s\S]*preload: false/);
  // Share images still render from the bundled OFL files (no network). Lexend stays gone.
  assert.match(read("assets/fonts/OFL-Montserrat.txt"), /SIL OPEN FONT LICENSE Version 1\.1/);
  for (const w of [400, 500, 600]) assert.ok(existsSync(`assets/fonts/Montserrat-latin-${w}.woff`) && existsSync(`assets/fonts/Montserrat-latin-ext-${w}.woff`));
  assert.ok(!existsSync("assets/fonts/LexendDeca-400.ttf"));
  assert.match(read("src/lib/og.tsx"), /fontFamily: "Montserrat"/);
  assert.ok(!/Google Sans/.test(read("src/lib/og.tsx")), "share images no longer use Google Sans");
  assert.ok(!/Lexend/i.test(read("src/lib/og.tsx")) && !/Lexend/i.test(read("src/lib/slides/export.ts")));
  assert.match(layout, /variable: "--font-sans"/);
  assert.match(read("src/styles/globals.css"), /body \{[^}]*font-family: var\(--f-sans\)/);
  assert.match(read("src/styles/globals.css"), /input,\s*textarea,\s*select,[\s\S]*font-family: var\(--f-sans\)/);
  assert.ok(!/next\/font/.test(read("src/lib/i18n/fonts.ts")), "localized pages do not load a second face");
  assert.match(read("src/components/i18n/i18n.css"), /html:not\(:lang\(en\)\) \{\s*--f-sans: var\(--font-sans\), ui-sans-serif/);
  const graphite = read("src/styles/graphite.css");
  assert.match(graphite, /html:not\(:has\(\[data-space-root\]\)\) \{[^}]*--f-sans: var\(--font-sans\), ui-sans-serif, system-ui/);
  assert.match(graphite, /--t-body: 1rem;/);
  assert.match(graphite, /--lh-body: 1\.65;/);
  const bad = walk("src").filter((f) => !f.endsWith("serve.ts") && !f.endsWith("styles/graphite.css") && !f.endsWith("app/layout.tsx") && !f.endsWith("lib/i18n/fonts.ts") && !f.endsWith("components/i18n/i18n.css") && !f.includes("/api/") && !f.includes("/site-builder/") /* fonts of generated sites, not the app */ && !f.includes("/app-builder/design/") /* font pairings offered to generated apps */ && !f.endsWith("slides/export.ts") && /Instrument|Inter\b|Helvetica|Arial|"Segoe/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
  assert.match(read("src/styles/tokens.css"), /--f-sans: var\(--font-sans\), ui-sans-serif, system-ui, sans-serif;/);
  assert.ok(!/Keplar Sans Fallback/.test(read("src/styles/globals.css")), "the Google Sans fallback face is gone");
  // --f-mono is limited to code-like surfaces.
  const mono = walk("src").filter((f) => f.endsWith(".css") && readFileSync(f, "utf8").includes("var(--f-mono)")).map((f) => path.relative("src", f).replace(/\\/g, "/")).sort();
  assert.deepEqual(mono, ["components/account/account.module.css" /* API keys and raw values (.pre) */, "components/app-ui/Markdown.module.css", "components/app-ui/create/create.module.css" /* chat Create card: Code tab */, "components/create/advanced/advanced.module.css" /* live editor, shared terminal, deploy logs */, "components/create/apps/VoiceLiveTheater.module.css" /* file tabs and the code being written live */, "components/create/apps/apps.module.css" /* generated file paths and raw records */, "components/create/apps/studio.module.css" /* studio Code and Changes panes */, "components/create/builder.module.css", "components/developers/Developers.module.css" /* API reference: endpoints, code samples, request fields */, "components/kb/kb.module.css", "components/sections/Creation.module.css", "styles/globals.css", "styles/kit.css" /* the kit's --ks-font-mono token maps to --f-mono */]);
});

test("usage label: sidebar says Keplar Usage, hides the meter when signed out; no stale 'Keplar Compute' copy", () => {
  assert.match(read("src/lib/site.ts"), /usage: "Keplar Usage"/);
  const side = read("src/components/app-ui/Sidebar.tsx");
  assert.match(side, /<span>\{brand\.usage\}<\/span>/);
  assert.match(side, /state\.ledger\.synced && state\.ledger\.signedIn \? \(/);
  assert.match(side, /state\.ledger\.synced && !state\.ledger\.signedIn \? \(/);
  const stale = walk("src").filter((f) => /Keplar Compute/.test(readFileSync(f, "utf8")));
  assert.deepEqual(stale, []);
});
