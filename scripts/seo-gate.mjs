#!/usr/bin/env node
/**
 * SEO gate: crawl the production build and fail on anything that would hurt indexing. Run after `next build`:
 *   node scripts/seo-gate.mjs --start              # starts `next start` on a free port, crawls, stops it
 *   node scripts/seo-gate.mjs http://localhost:3199  # crawls a server you started
 * Checks, per sitemap URL (English pages by default; --all-locales adds the localized ones): status 200, one <title> of a sane
 * length, a description, exactly one h1, a self-canonical (origin-insensitive), no noindex unless the whole build is noindex
 * (a local build never is indexable, in the meta and the X-Robots-Tag header), every JSON-LD block parses, every <img> has alt
 * text, at least 80 words of visible text (content pages), and the response is HTML. External links are not followed.
 * Whole site: duplicate titles or descriptions, orphan pages (scripts/seo-site-issues.mjs), broken internal links, every
 * sitemap in the index and llms.txt answering 200. Flags: --json <file> writes the full report. Exit 1 on any failure.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { writeFileSync } from "node:fs";
import { siteIssues } from "./seo-site-issues.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const allLocales = flag("--all-locales");
// Description bound matches the content tests (tests/kb-content.test.ts allows 200); results show about 155, so shorter is better, longer fails.
const LIMITS = { titleMax: 75, descriptionMax: 200, descriptionMin: 40 };
/** Pages that are product surfaces, not content: the visible-text floor does not apply (the chat home; see docs/seo/AUDIT-2026-10-19.md PR-1). */
const THIN_OK = new Set(["/"]);
/** Links that answer 404 off the production host by design (src/app/capabilities.json/route.ts): not a broken link on a local build. */
const PROD_ONLY = new Set(["/capabilities.json"]);
/** Links that are not pages, or are private by design, and so are not followed. */
const SKIP = /^\/(api|_next|app|admin|account|checkout|welcome|signin|signup|forgot-password|reset-password|verify-email|two-factor|secure-account|embed|dev|r|c|sp|i|s|sites|apps|invite|og|icons|fonts|fx|models\/)(\/|$)|^\/(sw\.js|manifest\.webmanifest|[a-f0-9]{32}\.txt)$/;
const unlocalized = (p) => p.replace(/^\/(?!vs\/)[a-z]{2,3}(?:-[a-z]{2,4})?(?=\/|$)/, "") || "/";

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });

async function startServer() {
  const port = await freePort();
  const env = { ...process.env, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "seo-gate-secret-0123456789abcdefghijklmnopqrstuv", BETTER_AUTH_URL: `http://localhost:${port}`, KEPLAR_DEV_TOOLS: "1", KEPLAR_MX_CHECK: "off", RESEND_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1", KEPLAR_DATA_DIR: process.env.KEPLAR_DATA_DIR || `${process.env.TMPDIR || "/tmp"}/keplar-seo-gate-${process.pid}` };
  // Its own process group, so stopping it also stops the server workers `next start` forks (otherwise the gate never exits).
  const child = spawn("npx", ["next", "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const stop = () => { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); } };
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`next start exited: ${log.slice(-800)}`);
    try { const r = await fetch(`${base}/api/health`); if (r.ok) return { base, stop }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`next start did not answer /api/health in 60 s: ${log.slice(-800)}`);
}

const attr = (h, re) => (h.match(re) || [])[1];
const textOf = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
/** Hosts whose links are internal: the server under test and the production site. Any other host is an external link and is not checked. */
const INTERNAL_HOSTS = new Set(["keplar.one", "www.keplar.one"]);
const pathOf = (u, base) => {
  try {
    const x = new URL(u, base);
    if (x.origin !== new URL(base).origin && !INTERNAL_HOSTS.has(x.hostname)) return null;
    return x.pathname.replace(/\/$/, "") || "/";
  } catch { return null; }
};

async function page(base, path) {
  const r = await fetch(base + path, { redirect: "manual", headers: { "user-agent": "keplar-seo-gate/1.0" } });
  const o = { path, status: r.status, location: r.headers.get("location"), xrobots: r.headers.get("x-robots-tag"), ct: r.headers.get("content-type") || "" };
  if (r.status !== 200 || !o.ct.includes("html")) return o;
  const h = await r.text();
  o.title = attr(h, /<title[^>]*>([^<]*)<\/title>/);
  o.titles = (h.match(/<title[\s>]/g) || []).length;
  o.desc = attr(h, /<meta name="description" content="([^"]*)"/);
  o.canonical = attr(h, /<link rel="canonical" href="([^"]*)"/);
  o.robots = attr(h, /<meta name="robots" content="([^"]*)"/);
  o.h1 = (h.match(/<h1[\s>]/g) || []).length;
  o.imgNoAlt = (h.match(/<img\b(?![^>]*\balt=)[^>]*>/g) || []).length;
  o.ld = []; o.ldBad = 0;
  for (const m of h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); o.ld.push(...(j["@graph"] ? j["@graph"].map((g) => g["@type"]) : [j["@type"]])); } catch { o.ldBad++; }
  }
  o.words = textOf(h).split(" ").length;
  o.links = [...new Set([...h.matchAll(/<a [^>]*href="([^"#?]+)/g)].map((m) => pathOf(m[1], base)).filter((p) => p && !SKIP.test(p)))];
  return o;
}

async function main() {
  const started = flag("--start") ? await startServer() : null;
  const base = (started?.base || args.find((a) => a.startsWith("http")) || "http://localhost:3199").replace(/\/$/, "");
  const issues = [];
  const warn = [];
  try {
    const smText = await (await fetch(`${base}/sitemap.xml`)).text();
    const locs = [...smText.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => pathOf(m[1], base)).filter(Boolean);
    const paths = [...new Set(locs)].filter((p) => allLocales || unlocalized(p) === p);
    if (!paths.length) issues.push("sitemap.xml: no URLs");
    console.log(`sitemap.xml: ${locs.length} URLs, crawling ${paths.length}${allLocales ? "" : " (English)"} from ${base}`);
    // The sitemap index, every file it lists, robots.txt and llms.txt must answer.
    const idx = await fetch(`${base}/sitemap-index.xml`);
    if (idx.status !== 200) issues.push(`sitemap-index.xml: status ${idx.status}`);
    else {
      const children = [...(await idx.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => pathOf(m[1], base));
      if (!children.includes("/sitemap.xml")) issues.push("sitemap-index.xml does not list /sitemap.xml");
      for (const c of children) {
        const r = await fetch(base + c);
        if (r.status !== 200 && r.status !== 503) issues.push(`${c}: status ${r.status}`);
        else if (r.status === 200 && !/<(urlset|sitemapindex)/.test(await r.text())) issues.push(`${c}: not a sitemap`);
      }
    }
    for (const f of ["/robots.txt", "/llms.txt"]) { const r = await fetch(base + f); if (r.status !== 200) issues.push(`${f}: status ${r.status}`); }
    // Crawl with a little concurrency.
    const res = [];
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => { for (;;) { const p = paths[i++]; if (!p) return; res.push(await page(base, p)); } }));
    const home = res.find((r) => r.path === "/");
    // A local build is never indexable: it sends noindex in the meta and the X-Robots-Tag header on every page, and that is expected.
    const buildNoindex = Boolean((home?.robots && /noindex/.test(home.robots)) || (home?.xrobots && /noindex/.test(home.xrobots)));
    if (buildNoindex) warn.push("build is noindex (not a production build): page-level noindex is not checked");
    for (const r of res) {
      const at = (msg) => issues.push(`${r.path}: ${msg}`);
      if (r.status !== 200) { at(`status ${r.status}${r.location ? ` -> ${r.location}` : ""}`); continue; }
      if (!r.ct.includes("html")) { at(`not HTML (${r.ct})`); continue; }
      if (r.titles !== 1 || !r.title) at(`${r.titles} <title> elements`);
      else if (r.title.length > LIMITS.titleMax) at(`title ${r.title.length} chars: ${r.title}`);
      if (!r.desc) at("no description");
      else if (r.desc.length > LIMITS.descriptionMax || r.desc.length < LIMITS.descriptionMin) at(`description ${r.desc.length} chars`);
      if (r.h1 !== 1) at(`${r.h1} h1 elements`);
      if (!r.canonical) at("no canonical");
      else if (pathOf(r.canonical, base) !== r.path) at(`canonical ${r.canonical}`);
      if (!buildNoindex && r.robots && /noindex/.test(r.robots)) at(`noindex in sitemap`);
      if (!buildNoindex && r.xrobots && /noindex/.test(r.xrobots)) at(`X-Robots-Tag ${r.xrobots}`);
      if (r.ldBad) at(`${r.ldBad} invalid JSON-LD block(s)`);
      if (r.imgNoAlt) at(`${r.imgNoAlt} <img> without alt`);
      if (r.words < 80 && !THIN_OK.has(r.path)) at(`only ${r.words} words of visible text`);
    }
    // Internal links that leave the sitemap set: each must resolve (a redirect is fine, a 4xx or 5xx is not).
    const known = new Set(res.map((r) => r.path));
    const outside = [...new Set(res.flatMap((r) => r.links || []).filter((l) => !known.has(l)))];
    const checked = new Map();
    let j = 0;
    await Promise.all(Array.from({ length: 6 }, async () => { for (;;) { const l = outside[j++]; if (!l) return; try { const r = await fetch(base + l, { redirect: "follow", method: "GET" }); checked.set(l, r.status); } catch { checked.set(l, 0); } } }));
    for (const [l, st] of checked) if ((st >= 400 || st === 0) && !(buildNoindex && PROD_ONLY.has(l))) issues.push(`link ${l}: status ${st}`);
    issues.push(...siteIssues(res.filter((r) => r.status === 200 && r.title !== undefined)));
    const ok = res.filter((r) => r.status === 200 && r.title).length;
    console.log(`pages ok: ${ok}/${res.length}; links outside the sitemap checked: ${checked.size}`);
    for (const w of warn) console.log(`note: ${w}`);
    if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ base, paths, res, issues, warn }, null, 1));
    console.log(issues.length ? `\nISSUES (${issues.length}):\n${issues.join("\n")}` : "\nISSUES: none");
    process.exitCode = issues.length ? 1 : 0;
  } finally {
    started?.stop();
    // Whatever the server leaves open, the gate's verdict is in: exit with it.
    setTimeout(() => process.exit(process.exitCode ?? 0), 3000).unref();
  }
}

main().catch((e) => { console.error(`seo-gate: ${e.message}`); process.exit(2); });
