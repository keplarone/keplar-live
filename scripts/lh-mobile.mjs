// Lighthouse mobile (default Moto-class emulation, simulated slow 4G) over key routes, N runs each, median reported.
//   node scripts/lh-mobile.mjs <baseUrl> <outDir> [--runs=3] [--routes=/,/pricing] [--slug=<published slug>]
// Signed-in routes (/app, /app/create, /account) reuse one local e2e account's session cookie (needs scripts/e2e-server.sh).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";
const a = process.argv.slice(2);
const base = a[0], out = a[1];
const opt = (k, d) => (a.find((x) => x.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const runs = +opt("runs", 3);
let routes = opt("routes", "/,/pricing,/about,/download,/help,/signin,/signup,/simulation,/privacy,/app,/app/create,/account").split(",");
const slug = opt("slug", "");
if (slug) routes.push(`/s/${slug}`);
fs.mkdirSync(out, { recursive: true });
// session cookie for signed-in routes
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext();
const h = { "content-type": "application/json", origin: base, "x-forwarded-for": `10.99.${(Date.now() >> 3) & 255}.7` };
await ctx.request.post(base + "/api/auth/sign-in/magic-link", { headers: h, data: { email: `lh.${Date.now().toString(36)}@example.com`, callbackURL: "/app" } });
const html = await (await ctx.request.get(base + "/dev/outbox")).text();
const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
await ctx.request.post(base + "/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } });
await ctx.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name: "Alex" } } });
const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
await b.close();
const median = (v) => v.slice().sort((x, y) => x - y)[Math.floor(v.length / 2)];
const rows = [];
for (const r of routes) {
  const signed = /^\/(app|account)/.test(r);
  const res = [];
  for (let i = 0; i < runs; i++) {
    const f = `${out}/${r.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${i}.json`;
    try {
      execFileSync("npx", ["lighthouse", base + r, "--output=json", `--output-path=${f}`, "--quiet", "--only-categories=performance,accessibility,best-practices,seo", "--chrome-flags=--headless=new --no-sandbox", ...(signed ? [`--extra-headers=${JSON.stringify({ Cookie: cookie })}`] : [])], { env: { ...process.env, CHROME_PATH: "/usr/bin/google-chrome" }, stdio: "pipe", timeout: 180000 });
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      const c = j.categories, au = j.audits;
      res.push({ perf: Math.round(c.performance.score * 100), a11y: Math.round(c.accessibility.score * 100), bp: Math.round(c["best-practices"].score * 100), seo: Math.round(c.seo.score * 100), lcp: au["largest-contentful-paint"].numericValue, tbt: au["total-blocking-time"].numericValue, cls: au["cumulative-layout-shift"].numericValue, fcp: au["first-contentful-paint"].numericValue, si: au["speed-index"].numericValue, bytes: au["total-byte-weight"].numericValue, url: j.finalDisplayedUrl });
    } catch (e) { console.log("FAIL", r, i, String(e.message).slice(0, 120)); }
  }
  if (!res.length) continue;
  const row = { route: r, runs: res.length, perf: median(res.map((x) => x.perf)), a11y: median(res.map((x) => x.a11y)), bp: median(res.map((x) => x.bp)), seo: median(res.map((x) => x.seo)), lcp: Math.round(median(res.map((x) => x.lcp))), tbt: Math.round(median(res.map((x) => x.tbt))), cls: +median(res.map((x) => x.cls)).toFixed(3), fcp: Math.round(median(res.map((x) => x.fcp))), si: Math.round(median(res.map((x) => x.si))), kb: Math.round(median(res.map((x) => x.bytes)) / 1024), perfRuns: res.map((x) => x.perf).join("/"), landed: res[0].url.replace(base, "") };
  rows.push(row);
  console.log(`${r.padEnd(14)} perf ${row.perf} (${row.perfRuns}) a11y ${row.a11y} bp ${row.bp} seo ${row.seo} | LCP ${row.lcp} TBT ${row.tbt} CLS ${row.cls} FCP ${row.fcp} SI ${row.si} | ${row.kb} KB${row.landed !== r ? " -> " + row.landed : ""}`);
}
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(rows, null, 1));
