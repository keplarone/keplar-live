// Public-route crawler: node scripts/launch-crawl.mjs [base] [out.json]
// Visits every sitemap URL + same-origin links found in the nav/footer/pages (one hop), checks status, console errors,
// failed requests, broken images, placeholder text and internal/external link status.
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = (process.argv[2] || "https://keplar.one").replace(/\/$/, "");
const OUT = process.argv[3] || "/tmp/crawl.json";
const BAD_TEXT = [/lorem ipsum/i, /\bTODO\b/, /\bFIXME\b/, /\bTBD\b/, /placeholder/i, /coming soon/i, /\bundefined\b/, /\[object Object\]/, /\bNaN\b/, /example\.com/i, /your-?domain/i, /xxx+/i];
const sm = await (await fetch(BASE + "/sitemap.xml")).text();
const urls = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace("https://keplar.one", BASE)));
for (const p of ["/", "/app", "/login", "/signup", "/pricing", "/privacy", "/terms", "/status", "/does-not-exist-xyz"]) urls.add(BASE + p);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const results = [];
const linkSet = new Map(); // href -> first page
const queue = [...urls];
const seen = new Set();
async function visit(u, hop) {
  if (seen.has(u)) return; seen.add(u);
  const page = await ctx.newPage();
  const r = { url: u, status: 0, consoleErrors: [], failedReqs: [], brokenImgs: [], badText: [], title: "", h1: 0, canonical: "", desc: "", og: "" };
  page.on("console", (m) => { if (m.type() === "error") r.consoleErrors.push(m.text().slice(0, 200)); });
  page.on("requestfailed", (q) => { const f = q.failure()?.errorText || ""; if (!/ABORTED/.test(f)) r.failedReqs.push(q.url().slice(0, 150) + " " + f); });
  page.on("response", (res) => { if (res.status() >= 400 && res.url().startsWith(BASE) && res.url() !== u) r.failedReqs.push(res.status() + " " + res.url().slice(0, 150)); });
  try {
    const res = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
    r.status = res?.status() || 0;
    await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const d = await page.evaluate(() => {
      const text = document.body.innerText || "";
      return {
        title: document.title, h1: document.querySelectorAll("h1").length,
        canonical: document.querySelector('link[rel=canonical]')?.href || "",
        desc: document.querySelector('meta[name=description]')?.content || "",
        og: document.querySelector('meta[property="og:image"]')?.content || "",
        links: [...document.querySelectorAll("a[href]")].map((a) => a.href),
        imgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc),
        text,
        noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
        hs: document.documentElement.scrollWidth > innerWidth + 2,
      };
    });
    r.title = d.title; r.h1 = d.h1; r.canonical = d.canonical; r.desc = d.desc; r.og = d.og; r.brokenImgs = d.imgs; r.noAlt = d.noAlt; r.hscroll = d.hs;
    for (const re of BAD_TEXT) { const m = d.text.match(re); if (m) { const i = m.index; r.badText.push(re.source + ": …" + d.text.slice(Math.max(0, i - 40), i + 60).replace(/\s+/g, " ") + "…"); } }
    for (const h of d.links) { if (!linkSet.has(h)) linkSet.set(h, u); }
  } catch (e) { r.error = String(e).slice(0, 200); }
  await page.close();
  results.push(r);
}
// concurrency 4
let idx = 0;
async function worker() { while (idx < queue.length) { const u = queue[idx++]; await visit(u, 0); } }
await Promise.all([1, 2, 3, 4].map(worker));
// link checking
const internal = [], external = [];
for (const [h, from] of linkSet) {
  if (!/^https?:/.test(h)) continue;
  const clean = h.split("#")[0];
  (clean.startsWith(BASE) ? internal : external).push([clean, from]);
}
const uniq = (a) => [...new Map(a.map((x) => [x[0], x])).values()];
const linkRes = [];
async function chk(list) {
  let i = 0;
  await Promise.all([1, 2, 3, 4, 5, 6].map(async () => {
    while (i < list.length) {
      const [h, from] = list[i++];
      try {
        let res = await fetch(h, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0 KeplarLaunchCheck" } });
        if (res.status >= 400) res = await fetch(h, { redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0 KeplarLaunchCheck" } });
        linkRes.push({ h, from, status: res.status });
      } catch (e) { linkRes.push({ h, from, status: 0, err: String(e).slice(0, 80) }); }
    }
  }));
}
const il = uniq(internal).filter(([h]) => !seen.has(h));
await chk(il); await chk(uniq(external));
await browser.close();
fs.writeFileSync(OUT, JSON.stringify({ results, linkRes }, null, 1));
const bad = results.filter((r) => r.status >= 400 || r.error || r.consoleErrors.length || r.failedReqs.length || r.brokenImgs.length || r.badText.length);
console.log(`pages ${results.length}, internal links checked ${il.length}, external ${uniq(external).length}`);
console.log("non-200 pages:", results.filter((r) => r.status !== 200).map((r) => r.status + " " + r.url).join("\n  "));
console.log("link problems:", linkRes.filter((l) => l.status >= 400 || l.status === 0).map((l) => `${l.status} ${l.h} (from ${l.from})`).join("\n  "));
for (const r of bad) console.log("\n#", r.status, r.url, JSON.stringify({ c: r.consoleErrors.slice(0, 3), f: r.failedReqs.slice(0, 3), i: r.brokenImgs.slice(0, 3), t: r.badText.slice(0, 4), e: r.error }));
console.log("\nmissing title/desc/canonical/h1!=1/hscroll:", results.filter((r) => r.status === 200 && (!r.title || !r.desc || !r.canonical || r.h1 !== 1 || r.hscroll)).map((r) => `${r.url} t=${!!r.title} d=${!!r.desc} c=${!!r.canonical} h1=${r.h1} hs=${r.hscroll}`).join("\n  "));
