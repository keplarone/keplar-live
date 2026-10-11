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

test("font: Google Sans (open-source OFL family, variable, swap) via next/font/google in the root layout; sans token feeds body; mono only for code", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import \{ Google_Sans, IBM_Plex_Mono \} from "next\/font\/google"/);
  assert.match(layout, /Google_Sans\(\{[\s\S]*display: "swap"/);
  assert.ok(!/Lexend/i.test(layout), "Lexend Deca is gone");
  // the OFL text ships with the static copies used for share images
  assert.match(read("assets/fonts/OFL-GoogleSans.txt"), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.ok(existsSync("assets/fonts/GoogleSans-400.ttf") && !existsSync("assets/fonts/LexendDeca-400.ttf"));
  assert.ok(!/Lexend/i.test(read("src/lib/og.tsx")) && !/Lexend/i.test(read("src/lib/slides/export.ts")));
  assert.match(layout, /variable: "--font-sans"/);
  assert.match(read("src/styles/globals.css"), /body \{[^}]*font-family: var\(--f-sans\)/);
  assert.match(read("src/styles/globals.css"), /input,\s*textarea,\s*select,[\s\S]*font-family: var\(--f-sans\)/);
  // No other sans/display family is named anywhere in app CSS or components.
  const bad = walk("src").filter((f) => !f.endsWith("serve.ts") && !f.includes("/api/") && !f.includes("/site-builder/") /* fonts of generated sites, not the app */ && !f.includes("/app-builder/design/") /* font pairings offered to generated apps */ && !f.endsWith("slides/export.ts") && !f.endsWith("styles/globals.css") /* names Arial only inside the metric-matched Keplar Sans Fallback face, checked below */ && /Instrument|Inter\b|Helvetica|Arial|"Segoe/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
  // The only Arial/Helvetica in the app CSS is the local() source of the metric-matched fallback for Google Sans, and the sans token lists it.
  const g = read("src/styles/globals.css");
  assert.match(g, /font-family: "Keplar Sans Fallback"[\s\S]*size-adjust/);
  assert.match(read("src/styles/tokens.css"), /--f-sans: var\(--font-sans\), "Keplar Sans Fallback"/);
  // --f-mono is limited to code-like surfaces.
  const mono = walk("src").filter((f) => f.endsWith(".css") && readFileSync(f, "utf8").includes("var(--f-mono)")).map((f) => path.relative("src", f).replace(/\\/g, "/")).sort();
  assert.deepEqual(mono, ["components/app-ui/Markdown.module.css", "components/app-ui/create/create.module.css" /* chat Create card: Code tab */, "components/app-ui/studio-mode/studio-mode.module.css" /* Luau code preview */, "components/create/advanced/advanced.module.css" /* live editor, shared terminal, deploy logs */, "components/create/apps/VoiceLiveTheater.module.css" /* file tabs and the code being written live */, "components/create/apps/apps.module.css" /* generated file paths and raw records */, "components/create/apps/studio.module.css" /* studio Code and Changes panes */, "components/create/builder.module.css", "components/developers/Developers.module.css" /* API reference: endpoints, code samples, request fields */, "components/kb/kb.module.css", "components/sections/Creation.module.css", "components/sky/MiniDemos.module.css" /* command and JSON examples */, "styles/globals.css"]);
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
