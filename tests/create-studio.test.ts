import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inferBlueprint, layoutFor, blueprintFromSpec, buildProgress } from "../src/components/create/apps/blueprint";
import { STARTERS } from "../src/components/create/apps/starters";
import { saveResume, loadResume, clearResume, resumeAction, isBusyError, RESUME_KEY, RESUME_MAX_AGE_MS, type ResumeRecord } from "../src/components/create/apps/resume";
import { diffLines, toHunks, compareVersions } from "../src/lib/app-builder/diff";
import { langOf, tokenize, sortFiles } from "../src/components/create/apps/highlight";
import { firstFamily, previewStylesheets, PREVIEW_FONTS_CSS } from "../src/lib/app-builder/design/preview-fonts";
import { CSP, APP_PAGE_CSP, APP_PAGE_HEADERS } from "../src/lib/security/headers";
import { createPromptStore, MIN_PROMPT } from "../src/components/create/apps/PromptField";

test("blueprint: a prompt sketches the right kind of app, and vague text stays unconfident", () => {
  const social = inferBlueprint("A social app where friends post photos, follow each other and comment");
  assert.equal(social.kind, "social");
  assert.ok(social.confident);
  assert.ok(social.screens.length >= 4);
  assert.ok(social.data.length > 0);
  assert.equal(inferBlueprint("An online store selling handmade candles with a cart and checkout").kind, "store");
  assert.equal(inferBlueprint("Book appointments at my hair salon").kind, "booking");
  const vague = inferBlueprint("hello");
  assert.equal(vague.confident, false);
  assert.deepEqual(vague.data, []);
  assert.equal(vague.label, "Your app");
  assert.ok(inferBlueprint("A chatbot that summarizes PDFs with AI, with user accounts and sign in").traits.includes("AI inside"));
});

test("blueprint: every starter is specific, buildable and maps to its own kind", () => {
  assert.ok(STARTERS.length >= 10);
  assert.equal(new Set(STARTERS.map((s) => s.id)).size, STARTERS.length);
  for (const s of STARTERS) {
    assert.ok(s.prompt.length >= 80, `${s.id} prompt too thin`);
    assert.equal(inferBlueprint(s.prompt).kind, s.kind, `${s.id} infers ${inferBlueprint(s.prompt).kind}`);
    assert.equal(inferBlueprint(s.prompt).screens.length, 5);
  }
});

test("blueprint: planned screens get layouts and progress states from written files and browser checks", () => {
  assert.equal(layoutFor("Sign in", "/login"), "auth");
  assert.equal(layoutFor("Checkout", "/checkout"), "checkout");
  assert.equal(layoutFor("Settings", "/settings"), "settings");
  const spec = { name: "Snapgram", kind: "social", auth: true, ai: [], collections: [{ name: "posts" }, { name: "comments" }], pages: [{ route: "/", title: "Feed" }, { route: "/profile/:id", title: "Profile" }, { route: "/settings", title: "Settings" }] };
  const bp = blueprintFromSpec(spec, { files: [{ path: "pages/profile.js" }], checks: [{ ok: true, route: "/settings" }] }, { building: true });
  assert.equal(bp.label, "Snapgram");
  assert.deepEqual(bp.screens.map((s) => s.state), ["writing", "written", "tested"]);
  assert.deepEqual(bp.data, ["posts", "comments"]);
  assert.deepEqual(bp.traits, ["Accounts"]);
  assert.equal(blueprintFromSpec(spec, { files: [], checks: [{ ok: false, route: "/" }] }).screens[0].state, "failed");
  assert.equal(blueprintFromSpec(spec).screens[0].state, "idle");
});

test("blueprint: build progress only moves forward through the stages and fills while files are written", () => {
  const order = ["", "plan", "generate", "verify", "visual", "save", "done"];
  const vals = order.map((s) => buildProgress(s, 0, 10));
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] >= vals[i - 1], `${order[i]} went backwards`);
  assert.ok(buildProgress("generate", 5, 10) > buildProgress("generate", 0, 10));
  assert.ok(buildProgress("generate", 50, 10) <= buildProgress("verify", 0, 10));
  assert.equal(buildProgress("done", 0, 0), 1);
});

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

test("resume: a build in flight survives a reload, expires after hours, and decides follow / failed / open", () => {
  const s = memStore();
  const rec: ResumeRecord = { appId: "sit_1", buildId: "bld_1", prompt: "a recipe app", edit: false, at: 1_000 };
  saveResume(rec, s);
  assert.ok(s.m.has(RESUME_KEY));
  assert.deepEqual(loadResume(2_000, s), rec);
  assert.equal(loadResume(1_000 + RESUME_MAX_AGE_MS + 1, s), null);
  saveResume(rec, s);
  clearResume(s);
  assert.equal(loadResume(2_000, s), null);
  s.setItem(RESUME_KEY, "{not json");
  assert.equal(loadResume(2_000, s), null);

  assert.deepEqual(resumeAction(null, null), { kind: "none" });
  assert.deepEqual(resumeAction(null, { id: "b", stage: "generate" }), { kind: "follow", buildId: "b" });
  assert.deepEqual(resumeAction(rec, { id: "bld_1", stage: "verify" }), { kind: "follow", buildId: "bld_1" });
  assert.deepEqual(resumeAction(rec, { id: "bld_1", stage: "failed", error: "Out of credits" }), { kind: "failed", error: "Out of credits" });
  assert.deepEqual(resumeAction(rec, null), { kind: "open" });
  const early = resumeAction({ ...rec, buildId: null }, null);
  assert.equal(early.kind, "failed");
  assert.ok(isBusyError({ code: "too_many_jobs" }));
  assert.ok(isBusyError({ message: "This project already has a build running." }));
  assert.ok(!isBusyError({ message: "Out of credits" }));
  assert.ok(!isBusyError(null));
});

test("diff: line diff, hunks with context, and per-file version changes", () => {
  const a = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].join("\n");
  const b = ["one", "two", "THREE", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"].join("\n");
  const ops = diffLines(a, b);
  assert.deepEqual(ops.filter((o) => o.t !== "=").map((o) => `${o.t}${o.text}`), ["-three", "+THREE", "+eleven"]);
  // Rebuilding b from the ops proves the script is complete.
  assert.equal(ops.filter((o) => o.t !== "-").map((o) => o.text).join("\n"), b);
  assert.equal(ops.filter((o) => o.t !== "+").map((o) => o.text).join("\n"), a);
  const hunks = toHunks(ops, 1);
  assert.equal(hunks.length, 2);
  assert.equal(hunks[0].oldStart, 2);
  assert.deepEqual(diffLines("same", "same"), [{ t: "=", text: "same" }]);
  // Too many edits falls back to a whole-file replacement instead of hanging.
  const big = diffLines(Array.from({ length: 300 }, (_, i) => `a${i}`).join("\n"), Array.from({ length: 300 }, (_, i) => `b${i}`).join("\n"), 10);
  assert.equal(big.filter((o) => o.t === "-").length, 300);
  assert.equal(big.filter((o) => o.t === "+").length, 300);

  const changes = compareVersions({ "app.js": "x\ny", "old.css": "a" }, { "app.js": "x\nz\nw", "pages/new.js": "n" });
  assert.deepEqual(changes.map((c) => [c.path, c.status, c.added, c.removed]), [["app.js", "changed", 2, 1], ["pages/new.js", "added", 1, 0], ["old.css", "removed", 0, 1]]);
  assert.deepEqual(compareVersions({ a: "1" }, { a: "1" }), []);
});

test("code view: languages, tokens round-trip the source, files read in app order", () => {
  assert.equal(langOf("pages/home.js"), "js");
  assert.equal(langOf("styles.css"), "css");
  assert.equal(langOf("index.html"), "html");
  assert.equal(langOf("README"), "text");
  const src = `// hi\nconst n = 42; const s = "str";`;
  const toks = tokenize(src, "js");
  assert.equal(toks.map((t) => t.v).join(""), src);
  assert.deepEqual(toks.filter((t) => t.k).map((t) => t.k), ["c", "k", "n", "k", "s"]);
  const html = `<div class="a"><!-- c --></div>`;
  assert.equal(tokenize(html, "html").map((t) => t.v).join(""), html);
  const css = `.a { color: #fff; margin: 4px }`;
  assert.equal(tokenize(css, "css").map((t) => t.v).join(""), css);
  assert.deepEqual(sortFiles(["styles.css", "lib/db.js", "pages/b.js", "app.js", "pages/a.js", "index.html", "notes.txt"]), ["index.html", "app.js", "pages/a.js", "pages/b.js", "lib/db.js", "styles.css", "notes.txt"]);
});

test("look previews: self-hosted fonts first; Google only for families without a local cut", () => {
  assert.equal(firstFamily(`"Fraunces", Georgia, serif`), "Fraunces");
  assert.equal(firstFamily(`'Space Grotesk', sans-serif`), "Space Grotesk");
  assert.equal(firstFamily(`system-ui, sans-serif`), null);
  const local = { displayStack: `"Fraunces", serif`, bodyStack: `"DM Sans", sans-serif`, google: "https://fonts.googleapis.com/css2?family=Fraunces" };
  const remote = { displayStack: `"Young Serif", serif`, bodyStack: `"DM Sans", sans-serif`, google: "https://fonts.googleapis.com/css2?family=Young+Serif" };
  assert.deepEqual(previewStylesheets([local]), [PREVIEW_FONTS_CSS]);
  assert.deepEqual(previewStylesheets([local, remote, remote]), [PREVIEW_FONTS_CSS, remote.google]);
  const css = readFileSync("public/fonts/previews/previews.css", "utf8");
  assert.match(css, /font-family: ?"Fraunces"/);
  assert.match(css, /unicode-range/);
});

test("security: app pages add Google Fonts and the Stripe bank-linking hosts; every other page stays global", () => {
  const dirs = (p: string) => Object.fromEntries(p.split(";").map((d) => d.trim()).filter(Boolean).map((d) => [d.split(/\s+/)[0], d]));
  const g = dirs(CSP);
  const a = dirs(APP_PAGE_CSP);
  const tokens = (d: string) => d.split(/\s+/).slice(1);
  const extra = (app: string, global: string) => tokens(app).filter((t) => !new Set(tokens(global)).has(t));
  assert.deepEqual(Object.keys(a).sort(), Object.keys(g).sort());
  assert.deepEqual(extra(a["style-src"], g["style-src"]), ["https://fonts.googleapis.com"]);
  assert.deepEqual(extra(a["font-src"], g["font-src"]), ["https://fonts.gstatic.com"]);
  assert.deepEqual(extra(a["script-src"], g["script-src"]), ["https://js.stripe.com"]);
  assert.deepEqual(extra(a["frame-src"], g["frame-src"]), ["https://js.stripe.com", "https://connect-js.stripe.com", "https://hooks.stripe.com"]);
  assert.deepEqual(extra(a["connect-src"], g["connect-src"]), ["https://api.stripe.com"]);
  for (const k of Object.keys(g)) {
    for (const t of tokens(g[k])) assert.ok(tokens(a[k]).includes(t), `${k} keeps ${t}`);
    if (!["style-src", "font-src", "script-src", "frame-src", "connect-src"].includes(k)) assert.equal(a[k], g[k], k);
  }
  assert.ok(!CSP.includes("fonts.googleapis.com"));
  assert.ok(!CSP.includes("js.stripe.com"), "Stripe.js stays off every page except /app");
  assert.doesNotMatch(APP_PAGE_CSP, /\*/, "no wildcards");
  assert.deepEqual(APP_PAGE_HEADERS.map((h) => h.key), ["Content-Security-Policy", "Cross-Origin-Opener-Policy"]);
  assert.equal(APP_PAGE_HEADERS.find((h) => h.key === "Cross-Origin-Opener-Policy")?.value, "same-origin-allow-popups");
  const cfg = readFileSync("next.config.ts", "utf8");
  assert.match(cfg, /source: "\/app\/:path\*".*headers: APP_PAGE_HEADERS/);
});

test("prompt store: typing never notifies until readiness flips or the text settles", () => {
  const s = createPromptStore();
  let n = 0;
  const off = s.subscribe(() => n++);
  assert.equal(s.get().ready, false);
  s._set({ ready: false });
  assert.equal(n, 0);
  s._set({ ready: true });
  s._set({ ready: true });
  assert.equal(n, 1);
  s._set({ settled: "x".repeat(MIN_PROMPT) });
  assert.equal(n, 2);
  let live = "typed but unsettled";
  s._bind(() => live);
  assert.equal(s.text(), "typed but unsettled");
  live = "more";
  assert.equal(s.text(), "more");
  off();
  s._set({ ready: false });
  assert.equal(n, 2);
  assert.equal(createPromptStore("a long enough prompt").get().ready, true);
});

test("create studio: heavy tabs and panes are code-split; the prompt box is uncontrolled", () => {
  const studio = readFileSync("src/components/create/CreateStudio.tsx", "utf8");
  assert.doesNotMatch(studio, /tab\("site"/, "Site Create tab must be gone");
  assert.match(studio, /const SiteBuilder = lazy\(/, "SiteBuilder stays lazy for resume/remix handoff only");
  for (const tab of ["ImageStudio", "VideoStudio", "MobileStudio"]) {
    assert.match(studio, new RegExp(`const ${tab} = lazy\\(`), `${tab} should be lazy`);
    assert.doesNotMatch(studio, new RegExp(`^import[^\\n]*\\b${tab}\\b`, "m"), `${tab} must not be imported statically`);
  }
  const builder = readFileSync("src/components/create/apps/AppBuilder.tsx", "utf8");
  for (const pane of ["DesignPicker", "CodePane", "ChangesPane"]) assert.match(builder, new RegExp(`lazy\\(\\s*\\(\\)\\s*=>\\s*import\\([^)]*${pane}`), `${pane} should be lazy`);
  const field = readFileSync("src/components/create/apps/PromptField.tsx", "utf8");
  assert.doesNotMatch(field, /\bvalue=\{/);
  assert.match(field, /composerEnter\(readComposerKey/);
  assert.match(readFileSync("src/lib/composer-keys.ts", "utf8"), /metaKey|ctrlKey/);
});
