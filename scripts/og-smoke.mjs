#!/usr/bin/env node
/**
 * Share-image smoke test against a live deployment: for one page of every page type, the og:image and twitter:image URLs in
 * the HTML must answer 200 with an image/* content-type. Page types come from the sitemap (one URL per route pattern:
 * /blogs/<slug>, /guides/<slug>, /docs/<section>/<page>, /es/..., ...) plus the hubs whose detail pages are not in the
 * sitemap (templates, answers, topics, showcase).
 *
 *   node scripts/og-smoke.mjs [https://keplar.one]
 *
 * Exits 1 when any image fails. Read-only: GET requests only.
 */
const BASE = (process.argv[2] || process.env.OG_SMOKE_BASE || "https://keplar.one").replace(/\/$/, "");
const UA = "KeplarOgSmoke/1.0 (+https://keplar.one/bot)";

async function get(url, accept = "text/html") {
  const r = await fetch(url, { headers: { "user-agent": UA, accept }, redirect: "follow" });
  return r;
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
function metaContent(html, attr, name) {
  const re = new RegExp(`<meta[^>]+${attr}="${name}"[^>]*content="([^"]*)"|<meta[^>]+content="([^"]*)"[^>]*${attr}="${name}"`, "i");
  const m = re.exec(html);
  return m ? decode(m[1] ?? m[2]) : null;
}

/** One representative path per route pattern: the first two segments decide the type ("/blogs/x" -> "/blogs/*"). */
function patternOf(path) {
  const seg = path.split("/").filter(Boolean);
  if (!seg.length) return "/";
  // Every translated locale renders the same templates, so all locales share one pattern ("/es/pricing" -> "/:locale/pricing").
  const locale = /^[a-z]{2,3}(-[a-z]{2})?$/.test(seg[0]) && seg[0] !== "ai" && seg[0] !== "vs" ? (seg.shift(), "/:locale") : "";
  if (!seg.length) return `${locale}/`;
  return `${locale}/${seg[0]}${seg.length > 1 ? `/*${seg.length > 2 ? "/*" : ""}` : ""}`;
}

async function samplePaths() {
  const xml = await (await get(`${BASE}/sitemap.xml`, "application/xml")).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const byPattern = new Map();
  for (const p of locs) if (!byPattern.has(patternOf(p))) byPattern.set(patternOf(p), p);
  // Detail pages that are not in the sitemap (user content, assembled pages): take the first link on each hub, when any.
  for (const hub of ["/templates", "/answers", "/topics", "/showcase"]) {
    const html = await (await get(`${BASE}${hub}`)).text();
    const m = new RegExp(`href="(${hub}/[a-z0-9][^"#?]*)"`).exec(html);
    if (m && !byPattern.has(patternOf(m[1]))) byPattern.set(patternOf(m[1]), m[1]);
  }
  return [...byPattern.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Vercel's bot mitigation answers some rapid repeats with 403 + x-vercel-mitigated: challenge. That says nothing about the image,
 * so each URL is fetched once (cached), a challenge is retried with a back-off, and a URL still challenged after that is reported
 * as "challenged" (a warning), never as a pass or a broken image.
 */
const seen = new Map();
async function checkImage(url) {
  if (seen.has(url)) return seen.get(url);
  let out;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await get(url, "image/*");
      const type = r.headers.get("content-type") || "";
      await r.arrayBuffer();
      if (r.status === 403 && r.headers.get("x-vercel-mitigated") === "challenge") {
        out = { ok: true, challenged: true, status: "403 challenged", type: "" };
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        continue;
      }
      out = { ok: r.status === 200 && type.startsWith("image/"), status: r.status, type };
      break;
    } catch (e) {
      out = { ok: false, status: 0, type: String(e) };
    }
  }
  seen.set(url, out);
  return out;
}

const rows = [];
let failed = 0;
const pause = () => new Promise((r) => setTimeout(r, 250)); // gentle: a handful of requests per second at most
for (const [pattern, path] of await samplePaths()) {
  await pause();
  const res = await get(`${BASE}${path}`);
  const html = await res.text();
  const og = metaContent(html, "property", "og:image");
  const tw = metaContent(html, "name", "twitter:image");
  if (res.status !== 200) { failed++; rows.push([pattern, path, `page ${res.status}`, "", ""]); continue; }
  const o = og ? await checkImage(new URL(og, BASE).href) : { ok: false, status: "none", type: "" };
  const t = tw ? await checkImage(new URL(tw, BASE).href) : { ok: false, status: "none", type: "" };
  if (!o.ok || !t.ok) failed++;
  rows.push([pattern, path, `og ${o.status} ${o.type}`, `tw ${t.status}`, og ?? "(no og:image)"]);
}
for (const r of rows) console.log(r.join(" | "));
const challenged = [...seen.values()].filter((v) => v.challenged).length;
console.log(`\n${rows.length} page types checked on ${BASE}; ${failed} with a broken share image${challenged ? `; ${challenged} image URL(s) still behind a bot challenge (not counted, re-run later)` : ""}.`);
process.exit(failed ? 1 : 0);
