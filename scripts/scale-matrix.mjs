// All-device scale matrix: node scripts/scale-matrix.mjs [baseUrl] [--engine=chromium|webkit|firefox] [--out=dir] [--set=os|zoom|text|all] [--shots]
// A "cell" is a physical screen (e.g. 3840x2160) x OS display scale (1, 1.25, 1.5, 2, 3) x browser zoom (80-200%).
// Emulation: CSS viewport = physical / (scale x zoom), devicePixelRatio = scale x zoom, which is exactly what a desktop browser reports.
// Chromium runs with classic (non-overlay) scrollbars, like Windows and most Linux desktops. Nothing here is a real Windows/macOS/Linux machine.
// Per cell and route: sideways overflow, element poking out of the viewport, an unused scrollbar gutter, type/nav sizes (to check proportional scaling).
// Extra probes: scrollbar-induced layout shift, font-fallback reflow (web fonts blocked), forced-colors, OS text scale.
import { chromium, webkit, firefox } from "playwright";
import fs from "node:fs";
const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const base = args.find((a) => /^https?:/.test(a)) || "http://localhost:3475";
const engine = opt("engine", "chromium");
const out = opt("out", `/tmp/scale-${engine}`);
const set = opt("set", "os");
const SHOTS = args.includes("--shots");
fs.mkdirSync(out, { recursive: true });
const launch = {
  chromium: () => chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"] }),
  webkit: () => webkit.launch(),
  firefox: () => firefox.launch(),
}[engine];
const browser = await launch();

const PHYS = [[1024, 600], [1366, 768], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160]];
const SCALES = [1, 1.25, 1.5, 2, 3];
const ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
let cells = [];
if (set === "os" || set === "all") for (const [w, h] of PHYS) for (const s of SCALES) cells.push({ w, h, scale: s, zoom: 1 });
if (set === "zoom" || set === "all") for (const [w, h] of [[1366, 768], [1920, 1080], [3840, 2160]]) for (const z of ZOOMS) if (z !== 1) cells.push({ w, h, scale: 1, zoom: z });
if (set === "text" || set === "all") for (const [w, h] of [[1366, 768], [1920, 1080]]) for (const t of [1.25, 1.5, 2]) cells.push({ w, h, scale: 1, zoom: 1, text: t });
const skipped = [];
cells = cells.filter((c) => {
  const cw = c.w / (c.scale * c.zoom), ch = c.h / (c.scale * c.zoom);
  if (cw < 320 || ch < 240) { skipped.push(`${c.w}x${c.h}@${c.scale}x zoom${c.zoom}: CSS ${Math.round(cw)}x${Math.round(ch)}`); return false; }
  return true;
});

let hop = 0;
async function signIn(ctx, email) {
  const h = { "content-type": "application/json", origin: base, "x-forwarded-for": `10.77.${(Date.now() >> 3) & 255}.${++hop}` };
  let r = await ctx.request.post(base + "/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } });
  if (!r.ok()) throw new Error("magic " + r.status());
  const html = await (await ctx.request.get(base + "/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  r = await ctx.request.post(base + "/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } });
  if (!r.ok()) throw new Error("confirm " + r.status());
  await ctx.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name: "Alex" } } });
}
const seed = await browser.newContext();
await signIn(seed, `scale.${engine}.${Date.now().toString(36)}@example.com`);
const state = await seed.storageState();

const probe = () => {
  const de = document.documentElement, vw = de.clientWidth;
  const over = Math.max(de.scrollWidth, document.body.scrollWidth) - vw;
  const poking = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right > vw + 2 && !el.closest("[aria-hidden=true], [data-static], [class*=scatter], [class*=Scene], canvas, svg")) {
      // ignore anything inside a clipping ancestor
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { const o = getComputedStyle(p); if (/hidden|clip|auto|scroll/.test(o.overflowX)) { clipped = true; break; } p = p.parentElement; }
      if (!clipped) poking.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0].replace(/__.*/, "")} r${Math.round(r.right)}`);
    }
    if (poking.length > 5) break;
  }
  const h1 = document.querySelector("h1"), nav = document.querySelector("nav, header");
  const fs = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
  return {
    vw, vh: innerHeight, dpr: devicePixelRatio, over, poking,
    gutter: innerWidth - vw, scrollable: de.scrollHeight > innerHeight + 1,
    body: fs(document.body), h1: fs(h1), navH: nav ? Math.round(nav.getBoundingClientRect().height) : null,
    docH: de.scrollHeight, rem: fs(de),
  };
};

const routes = [["a", "/"], ["a", "/pricing"], ["a", "/signin"], ["u", "/app"]];
const results = [];
for (const c of cells) {
  const cw = Math.round(c.w / (c.scale * c.zoom)), ch = Math.round(c.h / (c.scale * c.zoom));
  const tag = `${c.w}x${c.h}@${c.scale}x${c.zoom !== 1 ? `-z${Math.round(c.zoom * 100)}` : ""}${c.text ? `-t${Math.round(c.text * 100)}` : ""}`;
  for (const who of ["a", "u"]) {
    const ctx = await browser.newContext({ viewport: { width: cw, height: ch }, deviceScaleFactor: c.scale * c.zoom, reducedMotion: "no-preference", storageState: who === "u" ? state : undefined });
    if (c.text) await ctx.addInitScript((k) => { document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = `html{font-size:${k * 100}% !important}`; document.head.appendChild(st); }); }, c.text);
    for (const [w, r] of routes) {
      if (w !== who) continue;
      const p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
      await p.goto(base + r, { waitUntil: "load", timeout: 45000 }).catch((e) => errs.push("goto " + e.message.slice(0, 60)));
      await p.waitForTimeout(1100);
      const m = await p.evaluate(probe).catch((e) => ({ err: String(e).slice(0, 80) }));
      if (SHOTS && ["1024x600@1x", "1920x1080@1.25x", "2560x1440@1.5x", "3840x2160@2x", "3840x2160@1x", "3440x1440@1x", "1366x768@1x"].includes(tag)) await p.screenshot({ path: `${out}/${engine}-${tag}-${r.replace(/[^a-z0-9]+/gi, "_") || "home"}.png` }).catch(() => {});
      results.push({ cell: tag, route: r, cssW: cw, cssH: ch, ...m, errs });
      await p.close();
    }
    await ctx.close();
  }
}

// ---- Extra probes ------------------------------------------------------------------------------------------------
const extra = {};
// 1) Scrollbar layout shift: a short page (/signin) must not move when content makes it scrollable.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(base + "/signin", { waitUntil: "load" }); await p.waitForTimeout(800);
  const left = () => p.evaluate(() => { const e = document.querySelector("main h1, h1, form"); const r = e.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, w: Math.round(r.width * 10) / 10, gutter: innerWidth - document.documentElement.clientWidth }; });
  const a = await left();
  await p.evaluate(() => { const d = document.createElement("div"); d.id = "__tall"; d.style.cssText = "height:4000px;width:1px"; document.body.appendChild(d); });
  await p.waitForTimeout(200);
  const b = await left();
  extra.scrollbarShift = { before: a, after: b, shiftPx: Math.abs(a.x - b.x) + Math.abs(a.w - b.w) };
  await ctx.close();
}
// 2) Font fallback reflow: block the web fonts and compare layout height (a metric-matched fallback should barely change it).
{
  const rows = [];
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const r of ["/", "/pricing", "/about", "/help"]) {
    const m = {};
    for (const block of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      if (block) await ctx.route(/\.(woff2?|ttf|otf)(\?|$)/, (rt) => rt.abort());
      const p = await ctx.newPage();
      await p.goto(base + r, { waitUntil: "load" }).catch(() => {}); await p.waitForTimeout(1500);
      m[block ? "fallback" : "web"] = await p.evaluate(() => ({ docH: document.documentElement.scrollHeight, h1: Math.round(document.querySelector("h1")?.getBoundingClientRect().height || 0), fam: getComputedStyle(document.body).fontFamily.slice(0, 60) }));
      await ctx.close();
    }
    rows.push({ vp: `${w}x${h}`, route: r, web: m.web.docH, fallback: m.fallback.docH, pct: +(((m.fallback.docH - m.web.docH) / m.web.docH) * 100).toFixed(2), h1Web: m.web.h1, h1Fb: m.fallback.h1 });
  }
  extra.fontFallback = rows;
}
// 3) Forced colors (Windows High Contrast): controls must keep a visible edge; take screenshots.
if (engine !== "webkit") {
  const rows = [];
  for (const [w, h] of [[1280, 800], [390, 844]]) for (const r of ["/", "/pricing", "/signin"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, forcedColors: "active", colorScheme: "dark" }).catch(() => null);
    if (!ctx) break;
    const p = await ctx.newPage();
    await p.goto(base + r, { waitUntil: "load" }).catch(() => {}); await p.waitForTimeout(1200);
    const m = await p.evaluate(() => {
      const fc = matchMedia("(forced-colors: active)").matches;
      const vis = [...document.querySelectorAll("button, a[href], input, select, textarea")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8 && getComputedStyle(e).visibility !== "hidden"; });
      const bare = vis.filter((e) => { const cs = getComputedStyle(e); const edge = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none"; const ul = cs.textDecorationLine.includes("underline"); const ol = cs.outlineStyle !== "none"; return e.matches("input, select, textarea, button") && !edge && !ol && !ul && !e.closest("nav, [role=tablist]") && !e.querySelector("svg") && (e.textContent || "").trim().length > 0 && cs.backgroundColor === "rgba(0, 0, 0, 0)"; });
      return { fc, controls: vis.length, noEdge: bare.length, sample: bare.slice(0, 3).map((e) => e.tagName + ":" + (e.textContent || "").trim().slice(0, 20)) };
    }).catch((e) => ({ err: String(e).slice(0, 60) }));
    if (SHOTS) await p.screenshot({ path: `${out}/${engine}-forced-${w}-${r.replace(/[^a-z0-9]+/gi, "_") || "home"}.png` }).catch(() => {});
    rows.push({ vp: `${w}x${h}`, route: r, ...m });
    await ctx.close();
  }
  extra.forcedColors = rows;
}
fs.writeFileSync(`${out}/${engine}.json`, JSON.stringify({ results, extra, skipped }, null, 1));

// ---- Report ------------------------------------------------------------------------------------------------------
let bad = 0;
for (const r of results) {
  const probs = [];
  if (r.err) probs.push("ERR " + r.err);
  if (r.over > 1) probs.push(`H-OVERFLOW ${r.over}px`);
  if (r.poking?.length) probs.push("poking " + r.poking.slice(0, 3).join(" | "));
  if (r.errs?.length) probs.push("js " + r.errs.join(";"));
  if (probs.length) { bad++; console.log(`[${engine} ${r.cell}] css ${r.cssW}x${r.cssH} ${r.route}: ${probs.join("; ")}`); }
}
console.log(`\n${results.length} cell-routes in ${cells.length} cells, ${bad} with findings; skipped ${skipped.length} unrealistic cells (css <320x240).`);
// type scaling table at the home page (CSS px and as a share of the physical width)
console.log("\nHome page type/nav by cell (css viewport -> body px, h1 px, nav px, h1 as % of CSS width):");
for (const r of results.filter((x) => x.route === "/")) console.log(`${r.cell.padEnd(22)} css ${String(r.cssW).padStart(4)}x${String(r.cssH).padEnd(4)} body ${String(r.body).padStart(5)} h1 ${String(Math.round(r.h1)).padStart(4)} nav ${r.navH} gutter ${r.gutter}`);
console.log("\nscrollbar shift:", JSON.stringify(extra.scrollbarShift));
console.log("font fallback (docH change when web fonts are blocked):"); for (const f of extra.fontFallback) console.log(" ", JSON.stringify(f));
console.log("forced colors:"); for (const f of extra.forcedColors || []) console.log(" ", JSON.stringify(f));
if (skipped.length) console.log("skipped:", skipped.join(" ; "));
await browser.close();
