// Crawl a base URL: sitemap URLs + extras. Reports status, redirects, title, description, canonical, robots meta,
// h1 count, OG/Twitter, JSON-LD validity+types, internal links (broken check), words in initial HTML (no JS).
// Usage: node scripts/seo-crawl.mjs https://keplar.one [--json out.json]
import { siteIssues } from "./seo-site-issues.mjs";
const base = (process.argv[2] || "https://keplar.one").replace(/\/$/, "");
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const extras = ["/signin", "/signup", "/app", "/welcome", "/account", "/checkout", "/llms.txt", "/robots.txt", "/compare", "/definitely-missing-page"];
const get = async (u, opt = {}) => fetch(u, { redirect: "manual", headers: { "user-agent": "keplar-seo-crawl/1.0" }, ...opt });
const attr = (h, re) => (h.match(re) || [])[1];
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
async function page(path) {
  const r = await get(base + path);
  const o = { path, status: r.status, location: r.headers.get("location"), xrobots: r.headers.get("x-robots-tag") };
  if (r.status !== 200) return o;
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("html")) return { ...o, ct };
  const h = await r.text();
  o.title = attr(h, /<title>([^<]*)<\/title>/);
  o.desc = attr(h, /<meta name="description" content="([^"]*)"/);
  o.canonical = attr(h, /<link rel="canonical" href="([^"]*)"/);
  o.robots = attr(h, /<meta name="robots" content="([^"]*)"/);
  o.h1 = (h.match(/<h1[\s>]/g) || []).length;
  o.og = !!attr(h, /<meta property="og:image" content="([^"]*)"/);
  o.ogTitle = attr(h, /<meta property="og:title" content="([^"]*)"/);
  o.tw = !!attr(h, /<meta name="twitter:image" content="([^"]*)"/);
  o.words = text(h).split(" ").length;
  const ld = [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  o.ld = []; o.ldBad = 0;
  for (const m of ld) { try { const j = JSON.parse(m[1]); const t = (x) => (x["@graph"] ? x["@graph"].map((g) => g["@type"]) : [x["@type"]]); o.ld.push(...t(j)); } catch { o.ldBad++; } }
  o.links = [...new Set([...h.matchAll(/<a [^>]*href="(\/[^"#?]*)/g)].map((m) => m[1]))];
  return o;
}
const sm = await (await get(base + "/sitemap.xml")).text();
const urls = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1].replace(base, "") || "/");
const lastmods = [...sm.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]);
const res = [];
for (const p of [...urls, ...extras]) res.push({ ...(await page(p)), inSitemap: urls.includes(p) });
const known = new Set(urls);
const broken = new Map();
for (const r of res.filter((x) => x.links)) for (const l of r.links) {
  if (known.has(l) || /^\/(_next|api|icons|fx)/.test(l) || extras.includes(l) || broken.has(l)) continue;
  const rr = await get(base + l); broken.set(l, rr.status);
}
console.log(`sitemap URLs: ${urls.length}; distinct lastmod values: ${new Set(lastmods).size}`);
const issues = [];
for (const r of res) {
  const line = `${String(r.status).padEnd(4)} ${r.path.padEnd(42)} ${r.inSitemap ? "SM" : "  "} ${r.robots ? "[" + r.robots + "]" : ""}${r.xrobots ? " X:" + r.xrobots : ""} ${r.location ? "-> " + r.location : ""}`;
  console.log(line + (r.title ? `\n      T(${r.title.length}): ${r.title}\n      D(${(r.desc || "").length}): ${(r.desc || "").slice(0, 110)}\n      canon=${r.canonical} h1=${r.h1} words=${r.words} og=${r.og} tw=${r.tw} ld=${r.ld.join(",")} ldBad=${r.ldBad} links=${r.links.length}` : ""));
  if (r.inSitemap) {
    if (r.status !== 200) issues.push(`${r.path}: sitemap URL status ${r.status}`);
    if (r.robots && /noindex/.test(r.robots)) issues.push(`${r.path}: noindex in sitemap`);
    if (r.canonical && r.canonical.replace(base, "") !== r.path && !(r.path === "/" && (r.canonical === base + "/" || r.canonical === base))) issues.push(`${r.path}: canonical ${r.canonical}`);
    if (!r.title) issues.push(`${r.path}: no title`); if (r.h1 !== 1) issues.push(`${r.path}: h1=${r.h1}`);
    if (!r.desc) issues.push(`${r.path}: no description`); if (r.ldBad) issues.push(`${r.path}: invalid JSON-LD`);
  }
}
for (const [l, s] of broken) if (s >= 300) issues.push(`link ${l}: status ${s}`);
issues.push(...siteIssues(res.filter((r) => r.inSitemap && r.status === 200 && r.title !== undefined)));
if (process.argv.includes("--strict") && issues.length) process.exitCode = 1;
console.log("\nISSUES:", issues.length ? "\n" + issues.join("\n") : "none");
if (jsonOut) (await import("node:fs")).writeFileSync(jsonOut, JSON.stringify({ base, urls, lastmods, res, issues }, null, 1));
