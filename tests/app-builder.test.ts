import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSpec } from "@/lib/app-builder/spec";
import { APP_BUILD_LIMITS, chainFor } from "@/lib/app-builder/models";
import { tokensFor, normalizeDesign, designCss } from "@/lib/app-builder/design/tokens";
import { surpriseDeterministic } from "@/lib/app-builder/design/surprise";
import { rubricFindings } from "@/lib/app-builder/rubric";
import { autofixImports, staticCheck } from "@/lib/app-builder/verify/static";
import { parseFileBlocks, planWaves, finishFiles } from "@/lib/app-builder/generate";
import { resolveImageRefs, scanAppCode, normalizeAppFiles, appFileFor, cleanAppHtml } from "@/lib/app-builder/files";
import { parseReview } from "@/lib/app-builder/verify/review";
import { contrast } from "@/lib/site-builder/color";
import type { AppSpec } from "@/lib/app-builder/types";

const rawSocial = {
  name: "Grain", kind: "social", summary: "Film photo sharing",
  pages: [{ route: "/", title: "Feed" }, { route: "/p/:id", title: "Post" }, { route: "/u/:id", title: "Profile" }],
  collections: [
    { name: "posts", label: "Posts", fields: [{ name: "caption", type: "longtext", required: true }, { name: "photo", type: "image" }, { name: "id", type: "text" }], read: "public", create: "auth", update: "owner", delete: "owner", realtime: true, seed: [{ caption: "Portra at dusk", _ownerName: "Ines", evil: 1 }] },
    { name: "likes", label: "Likes", fields: [{ name: "post", type: "ref", ref: "posts" }], read: "public", create: "auth", update: "none", delete: "owner", unique: ["post", "_owner"] },
    { name: "users", label: "Nope", fields: [] },
  ],
  auth: { enabled: true, methods: ["password", "magic", "sms"], profileFields: ["bio", "email"] },
  ai: [{ name: "caption Helper", system: "Write captions.", input: [{ name: "notes", max: 99999 }], output: "text" }],
  features: [{ id: "likes", title: "Like posts" }],
  files: [{ path: "app.js", purpose: "entry" }, { path: "../evil.js" }, { path: "pages/feed.js", purpose: "feed" }, { path: "lib/ui.js", exports: ["Avatar", "bad name"] }],
  uses: [],
};

test("spec: untrusted planner output is validated; Free strips backend and AI and says so", () => {
  const pro = normalizeSpec(rawSocial, APP_BUILD_LIMITS.pro, "x");
  assert.deepEqual(pro.collections.map((c) => c.name), ["posts", "likes"], "reserved 'users' collection dropped");
  assert.ok(!pro.collections[0].fields.some((f) => f.name === "id"), "reserved field dropped");
  assert.deepEqual(pro.collections[0].seed, [{ caption: "Portra at dusk", _ownerName: "Ines" }], "unknown seed keys dropped");
  assert.deepEqual(pro.collections[1].unique, ["post", "_owner"]);
  assert.deepEqual(pro.auth.methods, ["password", "magic"]);
  assert.ok(!pro.auth.profileFields.includes("email"));
  assert.equal(pro.ai[0].name, "caption_Helper");
  assert.equal(pro.ai[0].input[0].max, 20000);
  assert.ok(pro.files.some((f) => f.path === "index.html") && !pro.files.some((f) => f.path.includes("..")));
  assert.deepEqual(pro.files.find((f) => f.path === "lib/ui.js")?.exports, ["Avatar"]);
  assert.ok(pro.uses.includes("ui"), "JS apps get the UI library");
  const free = normalizeSpec(rawSocial, APP_BUILD_LIMITS.free, "x");
  assert.equal(free.collections.length, 0);
  assert.equal(free.ai.length, 0);
  assert.equal(free.auth.enabled, false);
  assert.equal(free.scope, "reduced");
  assert.ok(free.notBuilt.some((n) => /Upgrade/.test(n)) && free.notBuilt.some((n) => /AI/.test(n)));
  const lite = normalizeSpec(rawSocial, APP_BUILD_LIMITS.lite, "x");
  assert.equal(lite.collections.length, 2);
  assert.equal(lite.ai.length, 0, "Lite has a backend but no AI proxy");
});

test("models: Free only ever gets $0 :free models; paid plans get the strong coder first", () => {
  for (const job of ["plan", "code", "fix", "vision", "design", "runtime-fast", "runtime-smart"] as const) {
    for (const m of chainFor("free", job)) assert.ok(m.free && m.id.endsWith(":free") && m.inPer1M === 0 && m.outPer1M === 0, `${job}: ${m.id}`);
  }
  assert.equal(chainFor("pro", "code")[0].id, "anthropic/claude-opus-5.5");
  assert.equal(chainFor("plus", "code")[0].id, "anthropic/claude-sonnet-5.5");
  assert.equal(chainFor("pro", "code", "cheap")[0].id, "anthropic/claude-sonnet-5.5", "breaker steps paid plans down one tier");
});

test("design: any picked palette is made readable; surprise is coherent and deterministic", () => {
  const d = normalizeDesign({ style: "brutalist", palette: { bg: "#ffffff", surface: "#fefefe", ink: "#f0f0f0", muted: "#eeeeee", accent: "#ffff00", accent2: "#00ff00" } });
  const t = tokensFor(d);
  assert.ok(contrast(t.palette.ink, t.palette.bg) >= 7, "body text >= 7:1");
  assert.ok(contrast(t.palette.muted, t.palette.bg) >= 4.5, "muted >= 4.5:1");
  assert.ok(contrast(t.palette.onAccent, t.palette.accent) >= 4.5, "text on accent >= 4.5:1");
  assert.ok(contrast(t.palette.accentText, t.palette.bg) >= 4.5);
  const css = designCss(t);
  for (const c of [".k-btn{", ".k-skeleton", ".k-empty", ".k-field", "--accent-text", "prefers-reduced-motion", "--shadow"]) assert.ok(css.includes(c), c);
  assert.deepEqual(surpriseDeterministic("a"), surpriseDeterministic("a"));
  assert.notDeepEqual(surpriseDeterministic("a"), surpriseDeterministic("b"));
  assert.equal(normalizeDesign({ style: "nope", fonts: "comic" }).style, "editorial");
});

test("rubric: template tells, stock images, CDN code and invented proof are caught", () => {
  const f = rubricFindings({
    "pages/home.js": `const x = "Lorem ipsum dolor"; import y from "https://esm.sh/react"; const img = "https://images.unsplash.com/x"; const s = "Trusted by thousands of teams"; const t = "Unlock your potential";`,
    "styles.css": `.blob{filter: blur(120px)} body{font-family: Inter, sans-serif}`,
  });
  const codes = new Set(f.map((x) => x.code));
  for (const c of ["lorem", "cdn-import", "stock-image", "fake-proof", "cliche", "blob", "default-font"]) assert.ok(codes.has(c), c);
  assert.equal(rubricFindings({ "styles.css": "body{font-family: var(--f-body)}" }).length, 0);
});

const spec = (o: Partial<AppSpec> = {}): AppSpec => normalizeSpec({ ...rawSocial, ...o }, APP_BUILD_LIMITS.pro, "x");

test("static check: syntax, missing files/exports, forgotten imports, unknown collections and AI actions", () => {
  const s = spec();
  const { issues } = staticCheck({
    "app.js": `import { Avatar, Nope } from "./lib/ui.js";\nimport Feed from "./pages/feed.js";\nimport X from "./pages/missing.js";\nconst { html } = window.kui;\nexport default function App(){ const [a] = useState(1); return html\`<\${Avatar} />\`; }`,
    "lib/ui.js": `export function Avatar(){ return null; }`,
    "pages/feed.js": `const { html } = window.kui;\nexport default function Feed(){ keplar.db.collection("posts"); keplar.db.collection("photos"); keplar.ai.run("captionX", {}); return html\`<div>\${PostCard}</div>\`; }\nexport function PostCard(){}`,
    "pages/bad.js": `export default function ( {`,
  }, s);
  const msgs = issues.map((i) => `${i.file}: ${i.message}`).join("\n");
  assert.match(msgs, /app\.js: Imports \{ Nope \}/);
  assert.match(msgs, /pages\/missing\.js does not exist/);
  assert.match(msgs, /app\.js: Uses useState without defining it/);
  assert.match(msgs, /collection "photos"/);
  assert.doesNotMatch(msgs, /collection "posts"/);
  assert.match(msgs, /AI action "captionX"/);
  assert.match(msgs, /pages\/bad\.js: Syntax error/);
});

test("generation: file blocks parse (fences stripped), waves put the foundation first, index.html is Keplar's", () => {
  const out = parseFileBlocks('<file path="a.js">\n```js\nexport const a = 1;\n```\n</file>\nnoise<file path="./B/c.css">\nb{}\n</file>');
  assert.equal(out["a.js"], "export const a = 1;\n");
  assert.equal(out["b/c.css"], "b{}\n");
  const s = spec({ files: [{ path: "app.js" }, { path: "lib/ui.js", exports: ["A"] }, { path: "pages/feed.js" }, { path: "pages/post.js" }, { path: "styles.css" }] } as never);
  const waves = planWaves(s, APP_BUILD_LIMITS.pro);
  assert.deepEqual(waves[0].flatMap((g) => g.files.map((f) => f.path)).sort(), ["lib/ui.js", "styles.css"]);
  assert.ok(waves[1].some((g) => g.files.some((f) => f.path === "app.js")));
  const fin = finishFiles(s, { "app.js": "x", "styles.css": "y", "styles/lib1.css": "z" });
  assert.match(fin["index.html"], /<script type="module" src="app\.js"><\/script>/);
  assert.match(fin["index.html"], /href="styles\/lib1\.css"/);
});

test("files: image refs resolve (placeholder when missing), abuse scan, app file rules", () => {
  const meta = { design: normalizeDesign({}), images: { hero: "https://keplar.one/i/abc" } };
  assert.equal(resolveImageRefs(`<img src="keplar-image:hero">`, meta), `<img src="https://keplar.one/i/abc">`);
  assert.match(resolveImageRefs(`url(keplar-image:other)`, meta), /^url\(data:image\/svg\+xml,[^()]+\)$/);
  assert.match(scanAppCode({ "a.js": "const m = new CoinHive.Anonymous('x')" }) ?? "", /mining/);
  assert.equal(scanAppCode({ "a.js": "export const ok = 1" }), null);
  assert.throws(() => normalizeAppFiles({ "app.js": "x" }, { maxFiles: 5, maxBytes: 1000 }), /index\.html/);
  const n = normalizeAppFiles({ "index.html": `<script>alert(1)</script><script src="https://evil/x.js"></script><script type="module" src="./app.js"></script><div onclick="x()">`, "app.js": "1", "kapp.css": "x" }, { maxFiles: 5, maxBytes: 100_000 });
  assert.ok(!n.files["kapp.css"]);
  assert.doesNotMatch(n.files["index.html"], /alert|evil|onclick/);
  assert.match(n.files["index.html"], /<script type="module" src="app\.js">/);
  assert.equal(appFileFor(["feed", "123"], n.files), "index.html", "SPA fallback");
  assert.equal(appFileFor(["missing.js"], n.files), null);
  assert.ok(cleanAppHtml(`<iframe src="x"></iframe>`).removed.length);
});

test("review: verdicts are tied to real feature ids and fixes to real files", () => {
  const s = spec();
  const r = parseReview(JSON.stringify({ verdicts: [{ id: "likes", status: "built", evidence: "toggle in PostCard" }, { id: "ghost", status: "built" }], visual: { score: 8.4, summary: "ok", issues: ["x"] }, fixes: [{ file: "pages/feed.js", problem: "p", instruction: "i" }, { file: "../etc/passwd", problem: "p" }, { file: "index.html", problem: "p" }] }), s, { "pages/feed.js": "x", "index.html": "y" });
  assert.ok(r);
  assert.deepEqual(r!.verdicts.map((v) => v.id), ["likes"]);
  assert.equal(r!.visual?.score, 8);
  assert.deepEqual(r!.fixes.map((f) => f.file), ["pages/feed.js"]);
});

test("autofix: hooks imported from a missing kui/preact module become window.kui destructuring, merged with an existing one", () => {
  const files = {
    "app.js": 'import Home from "./pages/home.js";\nconst { html, render } = window.kui;\nrender(html`<${Home} />`, document.getElementById("app"));\n',
    "pages/home.js": 'import { html, useState as useS } from "../lib/kui.js";\nimport { useEffect } from "preact/hooks";\nimport { fmt } from "../lib/util.js";\nexport default function Home() { const [a] = useS(0); useEffect(() => {}, []); return html`<p>${fmt(a)}</p>`; }\n',
    "pages/two.js": 'const { html } = window.kui;\nimport { useMemo } from "htm/preact";\nexport default function Two() { return html`<p>${useMemo(() => 1, [])}</p>`; }\n',
    "lib/util.js": "export const fmt = (n) => String(n);\n",
    "lib/kept.js": 'import { Button } from "./kui.js";\nexport const x = Button;\n',
  };
  const r = autofixImports(files);
  assert.deepEqual(r.changed.sort(), ["pages/home.js", "pages/two.js"]);
  assert.match(r.files["pages/home.js"], /const \{ html, useState: useS, useEffect \} = window\.kui;/);
  assert.match(r.files["pages/home.js"], /import \{ fmt \} from "\.\.\/lib\/util\.js";/);
  assert.match(r.files["pages/two.js"], /const \{ html, useMemo \} = window\.kui;/);
  assert.ok(!/htm\/preact/.test(r.files["pages/two.js"]));
  assert.equal(r.files["lib/kept.js"], files["lib/kept.js"], "non-hook names are left for the model fixer");
  assert.deepEqual(staticCheck(r.files, spec()).issues.filter((i) => i.file !== "lib/kept.js" && /kui|preact/.test(i.message)), []);
});

test("autofix: an import that climbs above the app root (or misses a folder) is pointed at the one file it names", () => {
  const files = {
    "app.js": 'import { Buddy } from "../lib/ui.js";\nimport Home from "./home.js";\nexport const a = [Buddy, Home];\n',
    "pages/home.js": 'import { Buddy } from "../lib/ui.js";\nconst Note = () => import("./lib/ui.js");\nexport default function Home() { return [Buddy, Note]; }\n',
    "lib/ui.js": "export const Buddy = 1;\n",
    "lib/a/x.js": 'import { y } from "./y.js";\nexport const x = y;\n',
    "lib/b/y.js": "export const y = 1;\n",
    "lib/c/y.js": "export const y = 2;\n",
  };
  const before = staticCheck(files, spec()).issues.map((i) => i.message).join("\n");
  assert.match(before, /\.\.\/lib\/ui\.js does not exist/);
  const r = autofixImports(files);
  assert.match(r.files["app.js"], /from "\.\/lib\/ui\.js"/);
  assert.match(r.files["app.js"], /from "\.\/pages\/home\.js"/, "a missed folder is found when the name is unique");
  assert.match(r.files["pages/home.js"], /from "\.\.\/lib\/ui\.js"/);
  assert.match(r.files["pages/home.js"], /import\("\.\.\/lib\/ui\.js"\)/);
  assert.equal(r.files["lib/a/x.js"], files["lib/a/x.js"], "two candidates: left for the model fixer");
  assert.deepEqual(r.changed.sort(), ["app.js", "pages/home.js"]);
});
