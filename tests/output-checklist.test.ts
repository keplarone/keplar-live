import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKLIST_IDS, checkOutput, checklistForPrompt, checklistSentence, fixOutput, summarizeChecklist } from "@/lib/create/output-checklist";

const page = (head: string, body: string, htmlAttrs = ' lang="en"') => `<!doctype html><html${htmlAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Studio</title>${head}</head><body><header><nav><a href="about.html">About</a></nav></header><main id="main"><h1>Light Studio</h1>${body}</main></body></html>`;
const css = `:root{--c:#111}body{margin:0;font-size:16px}img,picture{max-width:100%;height:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))}@media (max-width:640px){.grid{gap:1rem}}`;

const ok = (r: ReturnType<typeof checkOutput>, id: string) => r.items.find((i) => i.id === id)!.ok;

test("a clean site passes every required item and the summary says so", () => {
  const r = checkOutput({ "index.html": page("", `<p>Hello</p><img src="a.jpg" alt="A lamp" width="800" height="600">`), "styles.css": css }, "site");
  assert.equal(r.required.passed, r.required.total, JSON.stringify(r.items.filter((i) => i.required && !i.ok)));
  assert.equal(checklistSentence(r), `Security and mobile checklist: all ${r.total} checks pass.`);
  assert.equal(summarizeChecklist(r).failed.length, 0);
  assert.ok(CHECKLIST_IDS.length >= 30);
});

test("security: inline script, handlers, javascript: URLs, frames, external scripts, secrets and foreign form targets fail", () => {
  const files = {
    "index.html": page(`<script src="https://cdn.example.com/x.js"></script><script>alert(1)</script><base href="/x/">`, `<a href="javascript:void(0)" onclick="go()">x</a><iframe src="https://evil.example"></iframe><form action="https://collect.example/post"><input type="password" name="p"></form><a href="https://x.example" target="_blank">out</a><link rel="stylesheet" href="http://insecure.example/a.css">`),
    "styles.css": css,
    "app.js": `const k = "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef"; el.innerHTML = "<b>" + user.name + "</b>"; eval("1"); import("https://cdn.example.com/m.js");`,
  };
  const r = checkOutput(files, "site");
  for (const id of ["no-inline-script", "no-third-party-script", "no-inline-handlers", "no-javascript-urls", "no-embedded-frames", "no-base-or-refresh", "no-mixed-content", "safe-new-tab-links", "no-secrets", "forms-stay-on-site", "no-password-fields", "no-dynamic-code", "no-unsafe-innerhtml", "no-remote-imports"]) {
    assert.equal(ok(r, id), false, `${id} should fail`);
  }
  const prompt = checklistForPrompt(r);
  assert.match(prompt, /\[checklist:no-inline-script\]/);
  assert.doesNotMatch(prompt, /sk-or-v1/, "the prompt never repeats a secret");
  assert.doesNotMatch(JSON.stringify(summarizeChecklist(r)), /sk-or-v1/);
});

test("mobile: a locked viewport, a missing viewport, fixed-width pages, tiny text and long animations without reduced-motion are reported", () => {
  const locked = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"><title>T</title></head><body><main><h1>T</h1></main></body></html>`;
  const r = checkOutput({ "index.html": locked, "styles.css": `.page{width:1200px}body{overflow-x:hidden}small{font-size:10px}.hero{animation:spin 4s linear infinite}button{height:28px}` }, "site");
  assert.equal(ok(r, "zoom-allowed"), false);
  assert.equal(ok(r, "no-fixed-page-width"), false);
  assert.equal(ok(r, "no-overflow-mask"), false);
  assert.equal(ok(r, "readable-text"), false);
  assert.equal(ok(r, "reduced-motion"), false);
  assert.equal(ok(r, "tap-targets"), false);
  const none = checkOutput({ "index.html": `<!doctype html><html><head><title>T</title></head><body><main><img src="a.png"></main></body></html>` }, "site");
  assert.equal(ok(none, "viewport-meta"), false);
  assert.equal(ok(none, "charset"), false);
  assert.equal(ok(none, "html-lang"), false);
  assert.equal(ok(none, "img-alt"), false);
  assert.equal(ok(none, "fluid-images"), false);
});

test("fixOutput repairs what needs no model, is idempotent, and the result passes the required items", () => {
  const raw = {
    "index.html": `<!doctype html><html><head><meta name="viewport" content="width=device-width, user-scalable=no"></head><body><main><h1>Night Market</h1><img src="a.jpg"><img src="b.jpg"><a href="https://x.example" target="_blank">x</a></main></body></html>`,
    "styles.css": `.hero{animation:drift 6s ease-in-out infinite}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}`,
  };
  const once = fixOutput(raw, "site");
  assert.ok(once.fixed.length >= 6, once.fixed.join(" | "));
  const h = once.files["index.html"];
  assert.match(h, /<html lang="en">/);
  assert.match(h, /<meta charset="utf-8">/);
  assert.match(h, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(h, /<title>Night Market<\/title>/);
  assert.match(h, /<img src="a.jpg" alt="" decoding="async">/);
  assert.match(h, /<img src="b.jpg" alt="" loading="lazy" decoding="async">/);
  assert.match(h, /rel="noopener noreferrer"/);
  assert.match(once.files["styles.css"], /prefers-reduced-motion/);
  assert.match(once.files["styles.css"], /img, picture, video, svg, canvas \{ max-width: 100%/);
  const twice = fixOutput(once.files, "site");
  assert.deepEqual(twice.fixed, []);
  assert.deepEqual(twice.files, once.files);
  const r = checkOutput(once.files, "site");
  assert.equal(r.required.passed, r.required.total, JSON.stringify(r.items.filter((i) => i.required && !i.ok)));
});

test("apps: own module scripts are allowed, inline scripts and CDN scripts are not; an app without a stylesheet gets its base rules inline", () => {
  const app = { "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rolls</title><script type="module" src="app.js"></script></head><body><div id="app"></div></body></html>`, "app.js": `import { html, render } from "./ui.js"; render(html\`<h1>Rolls</h1>\`, document.getElementById("app"));`, "ui.js": `export const html = String.raw; export const render = (s, el) => { el.textContent = s; };` };
  const r = checkOutput(app, "app");
  assert.equal(r.required.passed, r.required.total, JSON.stringify(r.items.filter((i) => i.required && !i.ok)));
  assert.equal(ok(r, "main-landmark"), true, "an #app root counts for an app");
  const bad = checkOutput({ ...app, "index.html": app["index.html"].replace("</head>", `<script src="https://cdn.jsdelivr.net/npm/x"></script><script>init()</script></head>`) }, "app");
  assert.equal(ok(bad, "no-third-party-script"), false);
  assert.equal(ok(bad, "no-inline-script"), false);
  const fixed = fixOutput({ "index.html": app["index.html"].replace("<title>", `<style>.a{transition:all 2s}</style><title>`).replace('<div id="app"></div>', '<div id="app"><img src="x.png"></div>') }, "app");
  assert.match(fixed.files["index.html"], /<style>[\s\S]*prefers-reduced-motion[\s\S]*<\/style>/);
  assert.match(fixed.files["index.html"], /max-width: 100%/);
});

test("the kapp runtime scripts Keplar injects are not counted as third-party", () => {
  const r = checkOutput({ "index.html": page(`<script src="/fx/kapp.3.js"></script>`, "<p>x</p>"), "styles.css": css }, "app");
  assert.equal(ok(r, "no-third-party-script"), true);
});
