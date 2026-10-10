#!/usr/bin/env node
// Even-scrolling check: per route x viewport, scripted wheel scroll top->bottom while recording
//   frame intervals (rAF), long tasks, layout shifts during scroll (scroll-anchoring jumps), horizontal overflow,
//   and whether the page is left scroll-locked. Native scroll only (mouse.wheel / touch-equivalent).
//   node scripts/scroll-check.mjs <base> [--routes=/,/pricing] [--viewports=390x844m,844x390m,768x1024,1024x768,1440x900] [--json=out.json]
import fs from "node:fs";
import * as pw from "playwright";
const a = process.argv.slice(2);
const base = (a.find((x) => !x.startsWith("--")) || "http://localhost:3000").replace(/\/$/, "");
const opt = (k, d) => (a.find((x) => x.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=") || d;
const routes = opt("routes", "/,/pricing,/product,/docs,/download,/changelog,/templates,/enterprise").split(",");
const vps = opt("viewports", "320x640m,390x844m,844x390m,768x1024m,1024x768,1440x900,1920x1080").split(",").map((v) => {
  const m = /^(\d+)x(\d+)(m?)$/.exec(v);
  return { w: +m[1], h: +m[2], mobile: !!m[3], name: v };
});
const exe = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const rows = [];
for (const vp of vps) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1, colorScheme: "dark" });
  await ctx.addCookies([{ name: "keplar_consent", value: "1", url: base }]).catch(() => {});
  for (const r of routes) {
    const page = await ctx.newPage();
    const row = { vp: vp.name, route: r };
    try {
      await page.addInitScript(() => {
        window.__sc = { long: 0, longN: 0, cls: 0, shifts: [] };
        try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__sc.long += e.duration; window.__sc.longN++; } }).observe({ type: "longtask", buffered: true }); } catch {}
        try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (window.__scrolling && !e.hadRecentInput) { window.__sc.cls += e.value; window.__sc.shifts.push((e.sources || []).map((s) => s.node && (s.node.id ? "#" + s.node.id : (s.node.className && String(s.node.className).slice(0, 40)) || s.node.nodeName)).join(",")); } } }).observe({ type: "layout-shift", buffered: false }); } catch {}
      });
      const res = await page.goto(base + r, { waitUntil: "load", timeout: 45_000 });
      row.status = res?.status();
      await page.waitForTimeout(1500);
      await page.evaluate(() => { window.__sc.long = 0; window.__sc.longN = 0; window.__scrolling = true; window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__scrolling) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      const steps = Math.min(60, Math.max(8, Math.ceil(height / 250)));
      if (!vp.mobile) await page.mouse.move(vp.w / 2, vp.h / 2);
      for (let i = 0; i < steps; i++) {
        if (vp.mobile) await page.evaluate(() => window.scrollBy({ top: 250, behavior: "instant" }));
        else await page.mouse.wheel(0, 250);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        window.__scrolling = false;
        const f = window.__frames.slice(1).sort((x, y) => x - y);
        const q = (p) => f[Math.min(f.length - 1, Math.floor(f.length * p))] || 0;
        const de = document.documentElement;
        return {
          y: Math.round(scrollY), max: de.scrollHeight - innerHeight,
          frames: f.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), dropped: f.filter((x) => x > 50).length,
          longMs: Math.round(window.__sc.long), longN: window.__sc.longN, scrollCls: +window.__sc.cls.toFixed(4), shifts: [...new Set(window.__sc.shifts)].slice(0, 4),
          overflowX: Math.max(de.scrollWidth, document.body.scrollWidth) - de.clientWidth,
          locked: getComputedStyle(de).overflow === "hidden" || getComputedStyle(document.body).overflow === "hidden" || de.hasAttribute("data-scroll-lock"),
        };
      });
      Object.assign(row, m, { reach: Math.min(m.max, steps * 250) });
    } catch (e) { row.error = String(e).slice(0, 200); }
    rows.push(row);
    const bad = row.error || row.overflowX > 1 || row.locked || row.scrollCls > 0.05 || row.p95 > 100 || row.y < row.reach * 0.9;
    console.log(`${bad ? "!!" : "ok"} ${vp.name.padEnd(9)} ${r.padEnd(14)} ${row.error ?? `y=${row.y}/${row.max} p50=${row.p50} p95=${row.p95} drop=${row.dropped} long=${row.longMs}ms/${row.longN} cls=${row.scrollCls}${row.shifts?.length ? " [" + row.shifts.join(" | ") + "]" : ""} ox=${row.overflowX} locked=${row.locked}`}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
if (opt("json", "")) fs.writeFileSync(opt("json", ""), JSON.stringify(rows, null, 2));
const bad = rows.filter((r) => r.error || r.overflowX > 1 || r.locked || r.scrollCls > 0.05 || r.y < r.reach * 0.9); // stuck scroll = a trap
console.log(`\nchecked=${rows.length} hardFailures=${bad.length}`);
process.exitCode = bad.length ? 1 : 0;
