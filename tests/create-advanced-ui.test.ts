import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as Y from "yjs";
import { applyFiles, docFiles, filesOf, seedUpdate } from "@/lib/collab/doc";
import { runRules } from "@/lib/critic/engine";
import { applyFindings } from "@/lib/critic/patch";
import { ALL_FEATURES } from "@/lib/features";
import { siteSrcDoc } from "@/components/create/advanced/live-preview";
import { PAGE, CSS } from "./critic-fixtures";

const DIR = "src/components/create/advanced";
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

test("Create advanced UI: every pane exists, AppBuilder has Live / Critic / Deploy tabs and the publish gate", () => {
  for (const f of ["LivePane.tsx", "CriticPane.tsx", "DeployPane.tsx", "PublishGate.tsx", "LiveStudio.tsx", "LiveTab.tsx", "Editor.tsx", "Terminal.tsx", "InviteDialog.tsx", "useLiveSession.ts", "collab-client.ts"]) assert.ok(existsSync(`${DIR}/${f}`), f);
  assert.ok(existsSync("src/app/app/create/live/[id]/page.tsx"), "the /app/create/live/[id] route");
  const ab = read("src/components/create/apps/AppBuilder.tsx");
  assert.match(ab, /type Tab = [^;]*"live" \| "critic" \| "deploy"/);
  assert.match(ab, /live: "Live", critic: "Critic", deploy: "Deploy"/);
  assert.match(ab, /\["preview", "code", "changes", "live", "critic", "deploy", "look", "data", "settings"\]/);
  // minimal pass: only Preview / Code / Changes are visible tabs; the rest open from one More menu
  assert.match(ab, /const MAIN_TABS: Tab\[\] = \["preview", "code", "changes"\]/);
  assert.match(ab, /<MoreTabs tabs=\{moreTabs\}/);
  // the heavy editor stack loads only when the tab opens
  assert.match(ab, /lazy\(\(\) => import\("\.\.\/advanced\/LiveTab"\)\)/);
  assert.match(ab, /onClick=\{\(\) => setGate\(true\)\}/, "Publish opens the critic gate first");
  assert.match(read(`${DIR}/DeployPane.tsx`), /<DomainPanel siteId=\{siteId\} \/>/, "Deploy embeds the existing domain flow");
});

test("Create advanced UI: design rules (flat graphite, no gradients or purple-blue glow, focus via :focus-visible only, no fake numbers)", () => {
  const css = read(`${DIR}/advanced.module.css`);
  assert.doesNotMatch(css, /gradient\(/i);
  assert.doesNotMatch(css, /#(7c3aed|8b5cf6|6366f1|a855f7|4f46e5|2563eb)/i, "no purple-blue");
  assert.doesNotMatch(css, /box-shadow:[^;]*\b(\d{2,})px[^;]*(rgba?\(\s*(124|99|139)|#7c3aed)/i, "no glow");
  // focus styles: only :focus-visible draws anything
  for (const m of css.matchAll(/([^{}]*):focus(?!-visible|-within)[^{]*\{([^}]*)\}/g)) assert.match(m[2], /^\s*outline:\s*none;\s*$/, `:focus draws only "outline: none": ${m[1].trim()}`);
  const tsx = readdirSync(DIR).filter((f) => f.endsWith(".tsx")).map((f) => strip(read(`${DIR}/${f}`))).join("\n");
  assert.doesNotMatch(tsx, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(tsx, /trusted by|\d[\d,]*\+? (users|teams|customers)\b|powered by AI|supercharge|seamless/i);
});

test("features: collaboration and the AI critic are live and link to a real page", () => {
  for (const id of ["collab", "critic"]) {
    const f = ALL_FEATURES.find((x) => x.id === id)!;
    assert.equal(f.status, "live", id);
    assert.equal(f.href, "/app/create");
  }
});

test("live preview for sites: local stylesheets and scripts are inlined, external ones left alone, closing tags escaped", () => {
  const html = siteSrcDoc({
    "index.html": '<html><head><link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="https://fonts.example/x.css"><script src="app.js"></script></head><body><h1>Hi</h1></body></html>',
    "styles.css": "h1 { color: #111; }",
    "app.js": "document.title = '</script>';",
  }, "index.html");
  assert.match(html, /<style>h1 \{ color: #111; \}<\/style>/);
  assert.match(html, /href="https:\/\/fonts\.example\/x\.css"/);
  assert.match(html, /<script>document\.title = '<\\\/script>';<\/script>/);
  assert.equal(siteSrcDoc({ "about.html": "<p>About</p>" }, "index.html"), "<p>About</p>", "falls back to any page");
});

test("critic fixes in a live session edit the shared doc in place, and a second peer converges on the fixed files", () => {
  const seed = seedUpdate({ "index.html": PAGE, "styles.css": CSS }, 3);
  const a = new Y.Doc(); Y.applyUpdate(a, seed);
  const b = new Y.Doc(); Y.applyUpdate(b, seed);
  const before = filesOf(a).get("index.html");
  const findings = runRules(docFiles(a)).filter((f) => f.patch?.length);
  assert.ok(findings.length >= 3, "the flawed fixture has one-click fixes");
  const r = applyFindings(docFiles(a), findings.slice(0, 3));
  assert.ok(r.applied.length >= 1);
  const changed = applyFiles(a, r.files, "local");
  assert.ok(changed.length >= 1);
  assert.equal(filesOf(a).get("index.html"), before, "same Y.Text: carets of other people stay attached");
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  assert.deepEqual(docFiles(b), r.files);
});
