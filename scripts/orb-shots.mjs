import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:3470";
const out = process.argv[3] || "/workspace/shots/orb";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const [w, h, dpr, tag] of [[1440, 900, 1, "desk"], [390, 844, 2, "mob"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 500 });
  await ctx.addInitScript(() => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} });
  const p = await ctx.newPage();
  p.on("console", (m) => { if (/error/i.test(m.type())) console.log("  console:", m.text().slice(0, 300)); });
  p.on("pageerror", (e) => console.log("  pageerror:", String(e).slice(0, 300)));
  await p.goto(base + "/", { waitUntil: "load" });
  await p.waitForTimeout(6000);
  if (w > 500) await p.mouse.move(w * 0.62, h * 0.35);
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${tag}-0.png` });
  console.log(tag, await p.evaluate(() => { const c = document.querySelector("canvas"); return c ? c.width + "x" + c.height : "no canvas"; }));
  for (const f of [0.25, 0.55, 0.9]) {
    await p.evaluate((f) => { const s = document.querySelector("section[aria-label=Keplar]"); window.scrollTo(0, (s.offsetHeight - innerHeight) * f); }, f);
    await p.waitForTimeout(2200);
    await p.screenshot({ path: `${out}/${tag}-${Math.round(f * 100)}.png` });
  }
  await ctx.close();
}
await b.close();
