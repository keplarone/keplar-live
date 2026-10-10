// Composer typing latency with the 3D canvas running. node scripts/typing-latency.mjs [url] [--w=1440 --h=900] [--theme=light|dark]
import { chromium } from "playwright";
const a = process.argv.slice(2);
const url = a.find((x) => x.startsWith("http")) || "http://localhost:3482/?fq=low";
const W = +((a.find((x) => x.startsWith("--w=")) || "--w=1440").slice(4)), H = +((a.find((x) => x.startsWith("--h=")) || "--h=900").slice(4));
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const theme = (a.find((x) => x.startsWith("--theme=")) || "").slice(8);
const ctx = await b.newContext({ viewport: { width: W, height: H } });
if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); } catch {} }, theme);
await ctx.addInitScript(() => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} });
const p = await ctx.newPage();
await p.goto(url, { waitUntil: "load" });
await p.waitForSelector("canvas[data-ready]", { timeout: 90000 }).catch(() => console.log("no canvas ready (static mode?)"));
await p.waitForTimeout(4000);
await p.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: false }); });
await p.click("#hero-q");
const text = "Should I rent or buy a home in a big city?";
const rt = [];
for (const ch of text) { const t0 = Date.now(); await p.keyboard.type(ch); rt.push(Date.now() - t0); await p.waitForTimeout(35); }
const val = await p.inputValue("#hero-q");
const lt = await p.evaluate(() => window.__lt);
rt.sort((x, y) => x - y);
console.log(JSON.stringify({ ok: val === text, keys: rt.length, medianMs: rt[rt.length >> 1], p95Ms: rt[Math.floor(rt.length * 0.95)], maxMs: rt[rt.length - 1], longTasks: lt.length, longTaskMax: Math.max(0, ...lt) }));
await b.close();
