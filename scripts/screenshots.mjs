// Headless screenshots of the homepage narrative at key scroll positions.
// Usage: node scripts/screenshots.mjs [outDir] [baseUrl]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "screenshots/phase1";
const base = process.argv[3] ?? "http://localhost:3000";
const only = process.env.ONLY?.split(",");
mkdirSync(out, { recursive: true });

// vh positions = scene hold points (see src/gl/scenes.ts)
const stops = [
  ["01-hero", 0, 2500],
  ["02-question", 170, 3200],
  ["03-distribution", 290, 3200],
  ["04-responses", 392, 3200],
  ["05-disagreement", 525, 3500],
  ["06-verification", 655, 3500],
  ["07-convergence", 792, 3800],
  ["08-product", 960, 11000],
];

const viewports = [
  ["desktop", { width: 1440, height: 900 }, 1],
  ["mobile", { width: 390, height: 844 }, 2],
];

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
for (const [name, viewport, dpr] of viewports) {
  if (process.env.VP && process.env.VP !== name) continue;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: name === "mobile", isMobile: name === "mobile" });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${name}] ${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => console.log(`[${name}] pageerror: ${e.message}`));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas[data-ready]", { timeout: 20000 }).catch(() => console.log(`[${name}] canvas never ready`));
  for (const [label, vh, wait] of stops) {
    if (only && !only.includes(label)) continue;
    await page.evaluate((v) => window.scrollTo(0, (v / 100) * window.innerHeight), vh);
    await page.waitForTimeout(wait);
    const file = `${out}/${name}-${label}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
  await ctx.close();
}
await browser.close();
