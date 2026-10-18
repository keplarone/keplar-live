/** UX-6..13 (docs/rebirth/AUDIT.md, PARITY.md): copy matches the code, and the smaller accessibility fixes stay in place. */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ALL_FEATURES } from "../src/lib/features";
import { tiers } from "../src/lib/tiers";
import { compareGroups } from "../src/lib/growth/pricing-page";
import { allHelpItems } from "../src/lib/support/help";

const read = (p: string) => readFileSync(p, "utf8");
const feature = (id: string) => ALL_FEATURES.find((f) => f.id === id)!;

test("Office files, audio and links are live: the composer reads them through /api/keplar/extract, /transcribe and /link", () => {
  assert.equal(feature("office").status, "live");
  assert.equal(feature("links").status, "live");
  for (const route of ["extract", "transcribe", "link"]) assert.ok(existsSync(`src/app/api/keplar/${route}/route.ts`), route);
  assert.match(read("src/lib/attachments/extract.ts"), /readDocx[\s\S]*readPptx[\s\S]*readXlsx/);
  assert.match(read("src/components/app-ui/doc-client.ts"), /\/api\/keplar\/link/);
  assert.match(feature("docs").line, /RTF[\s\S]*zips of code/, "RTF and code zips are read too (extract.ts)");
});

test("web search: only the desktop app's Live Research searches the web; browser answers don't, and nothing says Keplar never opens a page", () => {
  const line = "Web search only in the desktop app (Live Research, beta)";
  for (const id of ["free", "plus"] as const) assert.ok(tiers.find((t) => t.id === id)!.features.includes(line), id);
  assert.ok(!tiers.some((t) => t.features.some((f) => /^no web lookups$/i.test(f))));
  const rows = compareGroups.flatMap((g) => g.rows);
  const live = rows.find((r) => r.label === "Live Research: web search in the desktop app")!;
  assert.ok(Object.values(live.values).every((v) => v === "Beta"), "Live Research has no plan gate (LIVE_BRIEF_CHARS covers Free)");
  assert.match(read("src/lib/research/live-request.ts"), /free: 14_000/);
  assert.equal(rows.find((r) => r.label === "Web search in browser answers")!.soon, true, "browser retrieval stays off by default (KEPLAR_RETRIEVAL_ENABLED)");
  assert.doesNotMatch(read("src/app/(marketing)/vs/[slug]/page.tsx"), /does not open or check sources/);
});

test("localized plan cards carry the same web-search line, not the old 'no web search' claim", () => {
  const dir = "src/lib/i18n/messages/marketing";
  for (const f of readdirSync(dir).filter((x) => x !== "en.ts")) {
    const s = read(path.join(dir, f));
    assert.equal((s.match(/Live Research/g) ?? []).length >= 2, true, `${f}: free and plus lines updated`);
  }
  assert.doesNotMatch(read(`${dir}/de.ts`), /"Keine Websuche"/);
});

test("stale copy: Space Studio status names the shipped version; Help no longer promises 'Coming soon' provider buttons; Wants has no PIN step", () => {
  const space = read("src/app/(space)/space-studio/page.tsx");
  assert.doesNotMatch(space, /What 0\.1 does today/);
  assert.match(space, /Space Studio 0\.2 for Windows/);
  assert.match(space, /What 0\.2 does today/);
  const signin = allHelpItems().find((i) => i.id === "signin")!;
  assert.doesNotMatch(signin.a.join(" "), /Coming soon/);
  assert.match(read("src/components/auth/ProviderButtons.tsx"), /\.filter\(\(p\) => providers\[p\.id\]\)/, "unconfigured providers are not rendered");
  assert.doesNotMatch(read("src/app/app/_tab.tsx"), /PIN/, "the PIN is a dev-sandbox step only (wants/orchestrate.ts sandboxEnabled)");
});

test("the roadmap's 'being built' table is hidden when nothing is marked soon", () => {
  assert.match(read("src/components/i18n/pages/RoadmapView.tsx"), /\{building\.length \? \(/);
});

test("chat: a heading structure (h1 title, h2 per question; answers' own headings start at h3) and unique limit-card ids", () => {
  const app = read("src/components/app-ui/KeplarApp.tsx");
  assert.match(app, /<h1 className="visually-hidden">\{thread\?\.title \?\? "Chat"\}<\/h1>/);
  assert.match(app, /<h2 className=\{s\.userMsg\} dir="auto">\{m\.text\}<\/h2>/);
  assert.match(read("src/components/app-ui/Markdown.tsx"), /b\.level <= 2 \? "h3" : "h4"/);
  const turn = read("src/components/app-ui/KeplarTurn.tsx");
  assert.doesNotMatch(turn, /id="limit-title"|aria-labelledby="limit-title"/);
  assert.equal((turn.match(/const titleId = useId\(\)/g) ?? []).length, 4);
});

test("focus: every keyboard-focused control gets the Space violet glow (never an outline, never invisible); text links an underline", () => {
  // Space UI (docs/design/space-ui.md): Space Studio's focus glow replaced the bar/underline cue on controls. :focus-visible only, so
  // a pointer press still draws nothing (e2e/no-focus-box).
  const g = read("src/styles/globals.css");
  const sp = read("src/styles/space.css");
  assert.match(g, /:focus, :focus-visible \{ outline: none !important; \}/);
  assert.match(sp, /:is\(a\[href\], button, summary, select, input:is\(\[type="checkbox"\], \[type="radio"\], \[type="range"\][^)]*\)[^{]*\[role="switch"\][^{]*\[tabindex="0"\]\):focus-visible \{\s*box-shadow: var\(--space-focus-glow\);/);
  assert.match(sp, /:root \{[\s\S]*?--space-focus-glow: 0 0 0 3px rgb\(125 59 196 \/ 0\.45\)/);
  assert.match(sp, /:root\[data-theme="dark"\] \{[\s\S]*?--space-focus-glow: 0 0 0 3px rgb\(195 155 255 \/ 0\.55\)/);
  assert.match(sp, /h6\) a\[href\]:not\(\[data-sp-btn\]\):focus-visible \{\s*box-shadow: none;\s*text-decoration-line: underline;/);
});

test("no window.confirm left in components: the kit dialog (confirmAction / confirmQuestion) asks instead", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []; });
  const offenders = walk("src/components").filter((f) => !f.endsWith(path.join("kit", "Hosts.tsx")) && /window\.confirm\(/.test(read(f)));
  assert.deepEqual(offenders, []);
});

test("design canvas: every selection the pointer can make has a keyboard path", () => {
  const c = read("src/components/business-app/DesignCanvas.tsx");
  assert.ok((c.match(/<SectionPicker /g) ?? []).length >= 2, "the part-of-page list in Design and in AI");
  for (const label of ["Select parent", "Select inside", "Previous", "Next"]) assert.match(c, new RegExp(`>${label}</button>`));
});
