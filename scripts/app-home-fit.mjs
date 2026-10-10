#!/usr/bin/env node
// Ask home vs the floating composer overlay: for each viewport, is the first row of starter cards fully above the dock?
//   node scripts/app-home-fit.mjs <base> [--shots=dir]
import fs from "node:fs";
import * as pw from "playwright";
const a = process.argv.slice(2);
const base = (a.find((x) => !x.startsWith("--")) || "http://localhost:3000").replace(/\/$/, "");
const shots = (a.find((x) => x.startsWith("--shots=")) || "").slice(8);
const VPS = [[320, 568, 1], [375, 667, 1], [414, 896, 1], [667, 375, 1], [844, 390, 1], [768, 1024, 1], [1024, 470], [1024, 600], [1024, 768], [1280, 600], [1280, 700], [1280, 800], [1366, 768], [1440, 900], [1920, 1080]];
const exe = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
let bad = 0;
for (const [w, h, m] of VPS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: !!m, hasTouch: !!m, deviceScaleFactor: m ? 2 : 1, colorScheme: "dark" });
  await ctx.addCookies([{ name: "keplar_consent", value: "1", url: base }]).catch(() => {});
  const page = await ctx.newPage();
  await page.goto(base + "/app/ask", { waitUntil: "load" });
  await page.waitForSelector("[aria-label='What you can do'] li", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const dock = document.querySelector("[class*='dock']:not([class*='dockNote'])");
    const tiles = [...document.querySelectorAll("[aria-label='What you can do'] li")].map((li) => li.getBoundingClientRect());
    const de = document.documentElement;
    if (!dock || !tiles.length) return { missing: true };
    const top = tiles[0].top;
    const firstRow = tiles.filter((t) => Math.abs(t.top - top) < 2);
    const dockTop = dock.getBoundingClientRect().top;
    return { dockTop: Math.round(dockTop), rowBottom: Math.round(Math.max(...firstRow.map((t) => t.bottom))), perRow: firstRow.length, ox: de.scrollWidth - de.clientWidth };
  });
  const ok = !r.missing && r.rowBottom <= r.dockTop && r.ox <= 1;
  if (!ok) bad++;
  console.log(`${ok ? "ok" : "!!"} ${w}x${h} ${JSON.stringify(r)}`);
  if (shots) await page.screenshot({ path: `${shots}/app-home-${w}x${h}.png` });
  await ctx.close();
}
await browser.close();
console.log(`\nfirst row clipped by the overlay: ${bad}`);
process.exitCode = bad ? 1 : 0;
