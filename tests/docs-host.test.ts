import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { isAppHost } from "@/lib/domains/routing";
import { docSections } from "@/lib/kb/docs";
import { DOC_SECTION_IDS } from "@/lib/kb/doc-sections";
import { DOCS_HOST, PRODUCTION_HOST } from "@/lib/site";
import { THEME_SCRIPT } from "@/lib/theme";

const nreq = (host: string, path: string) => new NextRequest(`https://${host}${path}`, { headers: { host } });
const rewriteOf = (r: Response) => r.headers.get("x-middleware-rewrite");
const docs = (path: string) => proxy(nreq(DOCS_HOST, path));

test("docs.keplar.one is an app host (not a custom-domain lookup)", () => {
  assert.equal(isAppHost(DOCS_HOST), true);
  assert.equal(isAppHost(PRODUCTION_HOST), true);
});

test("docs.keplar.one rewrites / and every section path into /docs (URL stays clean, query kept)", async () => {
  assert.equal(rewriteOf(await docs("/")), `https://${DOCS_HOST}/docs`);
  assert.equal(rewriteOf(await docs("/get-started/quickstart")), `https://${DOCS_HOST}/docs/get-started/quickstart`);
  assert.equal(rewriteOf(await docs("/reference?_rsc=abc")), `https://${DOCS_HOST}/docs/reference?_rsc=abc`);
  for (const s of docSections) assert.equal(rewriteOf(await docs(`/${s.id}`)), `https://${DOCS_HOST}/docs/${s.id}`, s.id);
});

test("the proxy's section list is the docs' own (no fs import in the proxy)", () => {
  assert.deepEqual([...DOC_SECTION_IDS].sort(), docSections.map((s) => s.id).sort());
});

test("docs.keplar.one serves /docs/... links as-is, so links inside the docs resolve on the subdomain", async () => {
  for (const p of ["/docs", "/docs/get-started/quickstart", "/docs/search-index.json"]) {
    const r = await docs(p);
    assert.equal(rewriteOf(r), null, p);
    assert.equal(r.status, 200, p);
  }
});

test("docs.keplar.one passes static files, _next, api and og through untouched", async () => {
  for (const p of ["/api/health", "/_next/static/chunks/a.js", "/og/docs/get-started", "/icons/icon-192.png", "/fonts/x.woff2", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/sw.js"]) {
    const r = await docs(p);
    assert.equal(rewriteOf(r), null, p);
    assert.equal(r.headers.get("location"), null, p);
  }
});

test("docs.keplar.one/favicon.ico is the docs favicon", async () => {
  assert.equal(rewriteOf(await docs("/favicon.ico")), `https://${DOCS_HOST}/icons/docs-favicon.ico`);
  assert.ok(readFileSync("public/icons/docs-favicon.ico").length > 100);
});

test("main-site paths on docs.keplar.one (nav, footer, sign-in) go to keplar.one, never a docs 404", async () => {
  for (const p of ["/pricing", "/blogs/some-post", "/app/ask", "/login?next=%2Fapp"]) {
    const r = await docs(p);
    assert.equal(r.status, 308, p);
    assert.equal(r.headers.get("location"), `https://${PRODUCTION_HOST}${p}`, p);
  }
});

test("apex keplar.one/docs still works and is not rewritten", async () => {
  assert.equal(rewriteOf(await proxy(nreq(PRODUCTION_HOST, "/docs"))), null);
  assert.equal(rewriteOf(await proxy(nreq(PRODUCTION_HOST, "/docs/get-started/quickstart"))), null);
  assert.equal(rewriteOf(await proxy(nreq(PRODUCTION_HOST, "/"))), null);
  assert.equal((await proxy(nreq(PRODUCTION_HOST, "/pricing"))).headers.get("location"), null);
});

test("canonical URLs for docs pages are keplar.one/docs/... on both hosts (relative canonical + metadataBase), so no duplicate", async () => {
  const { pageMeta } = await import("@/lib/seo");
  assert.equal(pageMeta("/docs/get-started/quickstart", "t", "d").alternates?.canonical, "/docs/get-started/quickstart");
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /metadataBase: new URL\(site\.url\)/);
});

/** Runs the real pre-paint theme script at a URL with a stored preference. */
function paint(url: string, stored: string | null) {
  const attrs: Record<string, string> = {};
  const classes = new Set<string>();
  const u = new URL(url);
  const root = { setAttribute: (k: string, v: string) => (attrs[k] = v), classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) }, style: {} as Record<string, string> };
  const document = { cookie: "", documentElement: root, location: { hostname: u.hostname, pathname: u.pathname } };
  const mm = () => ({ matches: true });
  new Function("localStorage", "document", "window", "matchMedia", THEME_SCRIPT)({ getItem: () => stored }, document, { matchMedia: mm }, mm);
  return attrs;
}

test("docs paint light with data-docs before first paint; the stored preference is kept and the main site uses the default (dark: the Space theme)", () => {
  for (const url of ["https://keplar.one/docs", "https://keplar.one/docs/get-started/quickstart", "https://docs.keplar.one/", "https://docs.keplar.one/reference"]) {
    const a = paint(url, "dark");
    assert.equal(a["data-theme"], "light", url);
    assert.equal(a["data-docs"], "1", url);
    assert.equal(a["data-theme-pref"], "dark", `${url}: preference untouched`);
  }
  for (const url of ["https://keplar.one/", "https://keplar.one/docsy", "https://keplar.one/pricing"]) {
    const a = paint(url, null);
    assert.equal(a["data-theme"], "dark", url); // Space UI: dark is the default (docs/design/space-ui.md); the docs stay light
    assert.equal(a["data-docs"], undefined, url);
  }
});

test("docs theme: off-white canvas, teal accent, no gradients or blur in the theme file, focus via :focus-visible only", () => {
  const css = readFileSync("src/styles/docs-theme.css", "utf8");
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /--c-canvas: #f7f8fa/);
  assert.match(code, /--docs-blue: #0a7a8a/);
  assert.doesNotMatch(code, /gradient\(/);
  assert.doesNotMatch(code, /blur\((?!0)/);
  assert.match(code, /--lg-bf: none/);
  assert.match(code, /:focus-visible/);
  assert.doesNotMatch(code.replace(/:focus:not\(:focus-visible\)/g, "").replace(/:focus-visible/g, ""), /:focus\b/);
  // purple-ish hues (r and b both well above g) are not allowed anywhere in the docs theme
  for (const m of code.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const [r, g, b] = [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
    assert.ok(!(r - g > 30 && b - g > 30), `#${m[1]} reads purple`);
  }
  const layout = readFileSync("src/app/(marketing)/docs/layout.tsx", "utf8");
  assert.match(layout, /docs-theme\.css/);
  assert.match(readFileSync("src/app/(marketing)/docs/icon.svg", "utf8"), /#0B57D0/i);
});
