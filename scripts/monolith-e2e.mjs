// Monolith home: fit at many viewports, the page always scrolls to the bottom, typing is instant, submit converges then opens the app, reduced motion/CPU-GL fall back. node scripts/monolith-e2e.mjs [base]
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:3482";
const SEL = "section[aria-label='Keplar']";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let bad = 0; const fail = (m) => { bad++; console.log("FAIL", m); };
const vps = [[1920, 1080], [1440, 900], [1366, 700], [1280, 720], [768, 1024], [390, 844], [360, 640], [320, 568]];
for (const [w, h] of vps) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800 });
  await ctx.addInitScript(() => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(base + "/?fq=low", { waitUntil: "load" });
  await p.waitForSelector(SEL, { timeout: 60000 });
  await p.waitForSelector("canvas[data-ready]", { timeout: 60000 }).catch(() => fail(`${w}x${h} canvas never ready`));
  await p.waitForTimeout(1200);
  // hero fit
  const hero = await p.evaluate(() => {
    const q = (s) => document.querySelector(s)?.getBoundingClientRect();
    const out = [...document.querySelectorAll("section[aria-label='Keplar'] [data-scene='0'] h1, [data-scene='0'] form, [data-scene='0'] ul, [data-scene='0'] p")].filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return { t: e.tagName, l: r.left, r: r.right, top: r.top, b: r.bottom }; });
    return { out, vw: innerWidth, vh: innerHeight, hs: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  for (const o of hero.out) { if (o.l < -1 || o.r > hero.vw + 1) fail(`${w}x${h} hero ${o.t} overflows x`); if (o.b > hero.vh + 1) fail(`${w}x${h} hero ${o.t} below fold (${Math.round(o.b)}>${hero.vh})`); }
  if (hero.hs) fail(`${w}x${h} sideways scroll`);
  // scenes: exactly one visible, fits the viewport
  for (let i = 0; i < 7; i++) {
    await p.evaluate(([i, SEL]) => { const s = document.querySelector(SEL); const top = s.getBoundingClientRect().top + scrollY; window.scrollTo(0, top + ((s.offsetHeight - innerHeight) * i) / 6); }, [i, SEL]);
    await p.waitForTimeout(450);
    const r = await p.evaluate(([i, SEL]) => {
      const sc = [...document.querySelectorAll(`${SEL} [data-scene]`)];
      const el = sc[i]; const rect = el.getBoundingClientRect();
      const kids = [...el.querySelectorAll("h1,h2,p,li,a,button,span,form")].filter((k) => k.getClientRects().length);
      const out = kids.filter((k) => { const q = k.getBoundingClientRect(); return q.width > 0 && (q.left < -1 || q.right > innerWidth + 1); }).map((k) => k.textContent.slice(0, 24));
      return { op: +el.style.opacity, only: sc.filter((e) => +e.style.opacity > 0.5).length, top: rect.top, bottom: rect.bottom, vh: innerHeight, out };
    }, [i, SEL]);
    if (r.op < 0.99 || r.only !== 1) fail(`${w}x${h} scene ${i} opacity ${r.op} visible ${r.only}`);
    if (r.out.length) fail(`${w}x${h} scene ${i} overflows x: ${r.out.join("|")}`);
    if (i > 0 && (r.top < 0 || r.bottom > r.vh)) fail(`${w}x${h} scene ${i} outside viewport ${Math.round(r.top)}..${Math.round(r.bottom)} of ${r.vh}`);
  }
  // no scroll-jacking: wheel scrolling reaches the very bottom of the page, and nothing resists scrolling back up
  await p.evaluate(() => window.scrollTo(0, 0));
  let y = -1, steps = 0, same = 0;
  const mouse = p.mouse; await mouse.move(w / 2, h / 2);
  while (steps < 400) { await mouse.wheel(0, 900); await p.waitForTimeout(40); const ny = await p.evaluate(() => scrollY); if (ny === y && ny > 0) { if (++same >= 6) break; } else same = 0; y = ny; steps++; }
  const end = await p.evaluate(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight }));
  if (end.max - end.y > 4) fail(`${w}x${h} page does not scroll to the bottom (${end.y}/${end.max})`);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  if (errs.length) fail(`${w}x${h} errors ${errs.join(";")}`);
  if (w === 1440) {
    // typing is instant, submit converges then opens the app
    const t0 = Date.now();
    await p.fill("#hero-q", "");
    await p.type("#hero-q", "Should I rent or buy?", { delay: 0 });
    const dt = Date.now() - t0;
    console.log("  typed 21 chars in", dt, "ms");
    if (dt > 1500) fail("typing slow " + dt);
    const t1 = Date.now();
    await Promise.all([p.waitForURL(/\/app/, { timeout: 15000 }), p.keyboard.press("Enter")]).catch(() => fail("submit did not open the app"));
    console.log("  submit -> app after", Date.now() - t1, "ms", p.url().slice(0, 60));
  }
  await ctx.close();
}
// reduced motion: stacked static layout, all six scenes readable, no canvas
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(base + "/", { waitUntil: "load" });
  await p.waitForSelector(SEL); await p.waitForTimeout(1500);
  const r = await p.evaluate((SEL) => { const s = document.querySelector(SEL); const sc = [...s.querySelectorAll("[data-scene]")]; return { mode: s.dataset.mode, vis: sc.filter((e) => getComputedStyle(e).visibility === "visible" && +getComputedStyle(e).opacity === 1).length, canvas: getComputedStyle(s.querySelector("canvas")).display }; }, SEL);
  if (r.mode !== "static" || r.vis !== 7 || r.canvas !== "none") fail("reduced motion " + JSON.stringify(r));
  console.log("reduced motion", JSON.stringify(r));
  await ctx.close();
}
// CPU rendering without the QA override: static fallback (no seconds-long frames)
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  await p.goto(base + "/", { waitUntil: "load" });
  await p.waitForSelector(SEL); await p.waitForTimeout(1500);
  const mode = await p.evaluate((SEL) => document.querySelector(SEL).dataset.mode, SEL);
  console.log("software GL, no ?fq:", mode);
  if (mode !== "static") fail("software GL should fall back to static, got " + mode);
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} failures` : "all ok");
process.exit(bad ? 1 : 0);
