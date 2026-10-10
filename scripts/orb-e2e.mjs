// Front-page orb hero: layout fits at many viewports, scene is alive, typing is instant, submit converges then opens the app.
import { chromium } from "playwright";
const base = process.argv.slice(2).find((a) => !a.startsWith("--")) || "http://localhost:3482";
const shots = process.argv.includes("--shots");
const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let bad = 0;
const fail = (m) => { bad++; console.log("  FAIL", m); };
const sizes = [[1920, 1080], [1440, 900], [1366, 700], [1280, 720], [768, 1024], [390, 844], [360, 640], [320, 568]];
for (const [w, h] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  await ctx.addInitScript(() => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(base + "/", { waitUntil: "load" });
  await p.waitForSelector("canvas[data-ready]", { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(2200);
  const r = await p.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (el) => { const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; };
    const hero = q("section[aria-label=Keplar]");
    const h1 = hero.querySelector("h1"), comp = hero.querySelector("form"), chips = [...hero.querySelectorAll("ul[aria-label='What Keplar does'] li")];
    const pill = hero.querySelector("p"), note = hero.querySelectorAll("p")[2];
    const nodes = [...hero.querySelectorAll("li[class*=node]")];
    const over = [pill, h1, ...chips, note].filter((e) => e && (e.scrollWidth > e.clientWidth + 1)).map((e) => e.textContent.slice(0, 30));
    return {
      mode: hero.dataset.mode, ready: Boolean(hero.querySelector("canvas[data-ready]")), vh: innerHeight, vw: innerWidth,
      h1: box(h1), comp: box(comp), chipsB: Math.max(...chips.map((c) => box(c).b)), chipsR: Math.max(...chips.map((c) => box(c).r)), chipsL: Math.min(...chips.map((c) => box(c).l)),
      noteB: note ? box(note).b : 0, over, nodes: nodes.map((n) => box(n)), h1Text: h1.textContent, hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  const tag = `${w}x${h}`;
  if (r.mode !== "webgl") fail(`${tag} mode ${r.mode}`);
  if (!r.ready) fail(`${tag} canvas not ready`);
  if (r.over.length) fail(`${tag} overflow: ${r.over.join(" | ")}`);
  if (r.hscroll) fail(`${tag} horizontal scroll`);
  if (r.h1.t < 0 || r.h1.b > r.vh) fail(`${tag} h1 outside first screen (${r.h1.t | 0}..${r.h1.b | 0} of ${r.vh})`);
  if (r.comp.b > r.vh + 1) fail(`${tag} composer below the fold (${r.comp.b | 0} > ${r.vh})`);
  if (r.chipsB > r.vh + 1) fail(`${tag} chips below the fold (${r.chipsB | 0} > ${r.vh})`);
  if (r.chipsR > r.vw + 0.5 || r.chipsL < -0.5) fail(`${tag} chips outside width`);
  if (w >= 761) for (const n of r.nodes) if (n.t < r.h1.b - 2 && n.t > 0 && false) fail(`${tag} node over headline`);
  if (!/One question\.\s*Multiple intelligences\.\s*One answer\./.test(r.h1Text)) fail(`${tag} h1 text "${r.h1Text}"`);
  if (errs.length) fail(`${tag} page errors ${errs.join(" ; ")}`);
  console.log(tag, "h1", r.h1.t | 0, r.h1.b | 0, "composer", r.comp.t | 0, r.comp.b | 0, "chips", r.chipsB | 0, "vh", r.vh);
  if (shots) await p.screenshot({ path: `/workspace/shots/orb/e2e-${tag}.png` });
  if (w === 1440) {
    // typing: zero delay (value and caret are native), and the scene stirs
    const ta = p.locator("#hero-q");
    await ta.click();
    const t0 = Date.now();
    await ta.pressSequentially("Should I rent or buy?", { delay: 0 });
    const val = await ta.inputValue();
    if (val !== "Should I rent or buy?") fail("typing lost characters: " + val);
    console.log("  typed 21 chars in", Date.now() - t0, "ms");
    await p.waitForTimeout(400);
    if (shots) await p.screenshot({ path: `/workspace/shots/orb/e2e-typing.png` });
    // scroll: pinned stage, copy fades, flood arrives, then the story follows
    const sc = await p.evaluate(async () => {
      const s = document.querySelector("section[aria-label=Keplar]");
      const out = [];
      for (const f of [0.15, 0.5, 0.95]) {
        window.scrollTo(0, (s.offsetHeight - innerHeight) * f);
        for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); const fl = +getComputedStyle(s.querySelector('div[class*=flood]')).opacity; if (f > 0.9 ? fl > 0.8 : i > 7) break; }
        out.push({ f, copy: getComputedStyle(s.querySelector("h1").closest("div[class*=content]")).opacity, flood: getComputedStyle(s.querySelector("div[class*=flood]")).opacity });
      }
      window.scrollTo(0, 0);
      return out;
    });
    console.log("  scroll", JSON.stringify(sc));
    if (!(+sc[0].copy < 1 && +sc[2].copy < 0.05 && +sc[2].flood > 0.8 && +sc[0].flood < 0.05)) fail("scroll phases " + JSON.stringify(sc));
    await p.waitForTimeout(800);
    // submit: converge, then the app opens with the question in the fragment
    const t1 = Date.now();
    await ta.click();
    await p.keyboard.press("Enter");
    await p.waitForURL(/\/app.*#q=/, { timeout: 6000 }).then(() => console.log("  submit → app after", Date.now() - t1, "ms")).catch(() => fail("submit did not open /app#q"));
  }
  await ctx.close();
}
// no WebGL / reduced motion: the page still shows everything
for (const [name, opts] of [["reduced-motion", { reducedMotion: "reduce" }]]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  await ctx.addInitScript(() => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} });
  const p = await ctx.newPage();
  await p.goto(base + "/", { waitUntil: "load" });
  await p.waitForTimeout(3500);
  const m = await p.evaluate(() => document.querySelector("section[aria-label=Keplar]").dataset.mode);
  console.log(name, "mode", m);
  if (m !== "still" && m !== "static") fail(`${name} mode ${m}`);
  if (shots) await p.screenshot({ path: `/workspace/shots/orb/e2e-${name}.png` });
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} FAILED` : "all ok");
process.exit(bad ? 1 : 0);
