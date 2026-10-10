// Route screenshots in Dark and Light. node scripts/route-shots.mjs <base> <outDir> [--m] [--routes=/a,/b]
import { chromium } from "playwright";
import fs from "node:fs";
const a = process.argv.slice(2);
const base = a.find((x) => x.startsWith("http")) || "https://keplar.one";
const out = a.find((x) => x.startsWith("/")) || "/workspace/shots/routes";
const mob = a.includes("--m");
const routes = ((a.find((x) => x.startsWith("--routes=")) || "").slice(9) || "/pricing,/help,/signin,/privacy,/about,/models,/how-it-works,/docs,/enterprise,/download,/contact,/blogs").split(",");
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const theme of ["dark", "light"]) {
  const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mob, isMobile: mob, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); localStorage.setItem("keplar-theme", t); } catch {} }, theme);
  const p = await ctx.newPage();
  for (const r of routes) {
    try { await p.goto(base + r, { waitUntil: "load", timeout: 60000 }); await p.waitForTimeout(1500); await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); }); await p.waitForTimeout(700); await p.screenshot({ path: `${out}/${mob ? "m" : "d"}-${theme}-${r.replace(/\//g, "_").slice(1) || "home"}.png`, fullPage: true, timeout: 60000 }); console.log("ok", theme, r); } catch (e) { console.log("FAIL", theme, r, String(e).slice(0, 80)); }
  }
  await ctx.close();
}
await b.close();
