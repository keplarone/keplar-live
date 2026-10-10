// Growth screenshots: full page + section crops at desktop (1440) and 375 px, dark theme, consent banner pre-answered (reject).
// Usage: node scripts/growth/shots.mjs <baseUrl> <outDir> "/pricing,/ai-app-builder" ["sel1,sel2"]
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "screenshots/growth";
const routes = (process.argv[4] ?? "/pricing").split(",");
const crops = (process.argv[5] ?? "").split(",").filter(Boolean);
const consent = encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [vp, viewport] of [["desktop", { width: 1440, height: 900 }], ["375", { width: 375, height: 812 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "dark" });
  await ctx.addInitScript((c) => { try { localStorage.setItem("keplar_consent", c); } catch {} }, consent);
  await ctx.addCookies([{ name: "keplar_consent", value: consent, url: base }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${vp}] pageerror ${e.message}`));
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: "networkidle", timeout: 120000 }).catch((e) => console.log("goto", r, e.message));
    await page.waitForTimeout(1200);
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } });
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const diag = await page.evaluate(() => {
      const over = [];
      for (const el of document.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect();
        if (b.right <= window.innerWidth + 1 || b.width === 0) continue;
        let p = el.parentElement, clipped = false;
        while (p) { if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(p).overflowX)) { clipped = true; break; } p = p.parentElement; }
        if (!clipped) over.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`);
      }
      return { overflowX: document.documentElement.scrollWidth - window.innerWidth, h1: document.querySelectorAll("h1").length, over: over.slice(0, 5) };
    });
    const name = r.replace(/^\//, "").replace(/[/?=&]/g, "_") || "home";
    await page.screenshot({ path: `${out}/${name}-${vp}.png`, fullPage: true });
    await page.screenshot({ path: `${out}/${name}-${vp}-top.png` });
    for (const sel of crops) {
      const loc = page.locator(sel).first();
      if (!(await loc.count())) continue;
      await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
      await loc.screenshot({ path: `${out}/${name}-${vp}-${sel.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")}.png` }).catch(() => {});
    }
    console.log(`${vp} ${r} h1=${diag.h1} overflowX=${diag.overflowX} ${diag.over.join(" ")}`);
  }
  await ctx.close();
}
await browser.close();
