// Monolith home: screenshots at each scene. node scripts/monolith-shots.mjs [base] [outDir] [--canvas]
import { chromium } from "playwright";
import fs from "node:fs";
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) || "http://localhost:3482";
const out = args.find((a) => a.startsWith("/")) || "/workspace/shots/monolith";
const canvasOnly = args.includes("--canvas");
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7);
const steps = (args.find((a) => a.startsWith("--steps=")) || "--steps=0,1,2,3,4,5,6").slice(8).split(",").map(Number);
for (const [name, vp, touch] of [["d", { width: 1440, height: 900 }, false], ["m", { width: 390, height: 844 }, true], ["s", { width: 800, height: 520 }, false]].filter((x) => !only || x[0] === only)) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(() => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "pageerror:", String(e).slice(0, 300)));
  p.on("console", (m) => { if (m.type() === "error") console.log(name, "console:", m.text().slice(0, 200)); });
  await p.goto(base + "/?fq=low&orbdebug=1", { waitUntil: "load" });
  await p.waitForSelector("canvas[data-ready]", { timeout: 60000 }).catch(() => console.log(name, "no canvas ready"));
  await p.waitForTimeout(2500);
  for (const i of steps) {
    const y = await p.evaluate((i) => { const s = document.querySelector("section[aria-label='Keplar']"); const top = s.getBoundingClientRect().top + scrollY; return top + ((s.offsetHeight - innerHeight) * i) / 6; }, i);
    await p.evaluate((y) => window.scrollTo(0, y), y);
    await p.waitForTimeout(2600);
    if (canvasOnly) { const d = await p.evaluate(() => window.__mono.debugShot()); fs.writeFileSync(`${out}/${name}-canvas-${i}.png`, Buffer.from(d.split(",")[1], "base64")); }
    else await p.screenshot({ path: `${out}/${name}-${i}.png`, timeout: 90000 });
    console.log(name, i, "ok");
  }
  await ctx.close();
}
await b.close();
