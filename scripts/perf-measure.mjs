#!/usr/bin/env node
// Route weight + Web Vitals on a running production server (local `next start` or a preview URL).
//   node scripts/perf-measure.mjs <baseUrl> [--routes=/,/pricing] [--runs=3] [--json=out.json]
// Per route (mobile emulation, 4x CPU throttle, median of runs): JS files, JS on the wire, JS decoded, CSS on the wire, fonts,
// whether three.js was fetched in the first 4 s with no interaction, FCP, LCP, CLS, and long-task total before 4 s (a TBT proxy).
import fs from "node:fs";
import { chromium, devices } from "playwright";
const a = process.argv.slice(2);
const base = a.find((x) => !x.startsWith("--"));
const opt = (k, d) => (a.find((x) => x.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=") || d;
const routes = opt("routes", "/,/pricing,/how-it-works,/blogs,/security,/app/ask,/app/create").split(",");
const runs = +opt("runs", 3);
const median = (v) => v.slice().sort((x, y) => x - y)[Math.floor(v.length / 2)];
const exe = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
const rows = [];
for (const r of routes) {
  const res = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await b.newContext({ ...devices["Pixel 7"] });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      window.__v = { lcp: 0, cls: 0, lt: 0, fcp: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.startTime < 4000) window.__v.lt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__v.fcp = e.startTime; }).observe({ type: "paint", buffered: true });
    });
    const files = [];
    page.on("response", async (resp) => {
      const t = resp.request().resourceType();
      if (!["script", "stylesheet", "font"].includes(t)) return;
      try {
        const sizes = await resp.request().sizes();
        const body = t === "script" ? await resp.body() : null;
        files.push({ t, url: resp.url(), wire: sizes.responseBodySize, decoded: body ? body.length : 0, three: body ? body.includes("THREE.WebGLRenderer") || body.includes("WebGLRenderer:") : false });
      } catch {}
    });
    try {
      await page.goto(base + r, { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(4000);
      const v = await page.evaluate(() => window.__v);
      const js = files.filter((f) => f.t === "script" && f.url.startsWith(base));
      res.push({
        jsFiles: js.length, jsWire: js.reduce((s, f) => s + f.wire, 0), jsDecoded: js.reduce((s, f) => s + f.decoded, 0),
        cssWire: files.filter((f) => f.t === "stylesheet").reduce((s, f) => s + f.wire, 0), fonts: files.filter((f) => f.t === "font").length,
        three: files.some((f) => f.three), thirdPartyJs: files.filter((f) => f.t === "script" && !f.url.startsWith(base)).length,
        fcp: v.fcp, lcp: v.lcp, cls: v.cls, lt: v.lt, final: page.url().replace(base, ""),
      });
    } catch (e) { console.log("FAIL", r, String(e.message).slice(0, 120)); }
    await ctx.close();
  }
  if (!res.length) continue;
  const m = (k) => median(res.map((x) => x[k]));
  rows.push({ route: r, final: res[0].final, jsFiles: m("jsFiles"), jsWireKB: Math.round(m("jsWire") / 1024), jsDecodedKB: Math.round(m("jsDecoded") / 1024), cssWireKB: Math.round(m("cssWire") / 1024), fonts: m("fonts"), three: res.filter((x) => x.three).length + "/" + res.length, thirdPartyJs: m("thirdPartyJs"), fcp: Math.round(m("fcp")), lcp: Math.round(m("lcp")), cls: +m("cls").toFixed(3), longTaskMs: Math.round(m("lt")) });
}
await b.close();
console.table(rows);
const out = opt("json", "");
if (out) fs.writeFileSync(out, JSON.stringify(rows, null, 2));
