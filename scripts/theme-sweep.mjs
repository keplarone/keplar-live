// Theme sweep: every route x {dark, light, auto/os-light, auto/os-dark}. node scripts/theme-sweep.mjs [base] [--mobile] [--routes=/a,/b] [--shots=dir]
import { chromium } from "playwright";
import fs from "node:fs";
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) || "http://localhost:3482";
const mobile = args.includes("--mobile");
const only = (args.find((a) => a.startsWith("--routes=")) || "").slice(9).split(",").filter(Boolean);
const shots = (args.find((a) => a.startsWith("--shots=")) || "").slice(8);
if (shots) fs.mkdirSync(shots, { recursive: true });
const ROUTES = only.length ? only : ["/", "/about", "/product", "/pricing", "/how-it-works", "/keplar-one", "/models", "/download", "/compare", "/compare-ai-models", "/multi-model-ai", "/ai-answer-engine", "/chatgpt-alternative", "/for-you", "/for-students", "/for-developers", "/use-cases", "/guides", "/glossary", "/blogs", "/docs", "/enterprise", "/agents", "/prompts", "/vs", "/privacy", "/terms", "/status", "/signin", "/signup", "/forgot-password", "/feedback", "/inquire", "/welcome", "/account", "/checkout", "/simulation", "/superintelligence", "/si-vs-ai", "/app", "/app/slides", "/app/study", "/app/create", "/admin", "/does-not-exist-404"];
const THEMES = [
  ["dark", "dark", "dark"], ["light", "light", "light"], ["auto", "light", "light"], ["auto", "dark", "dark"],
];
import zlib from "node:zlib";
function samplePng(buf) { // mean colour of a PNG (8-bit RGB/RGBA, non-interlaced), enough for flat/gradient backdrops
  let o = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o); const type = buf.toString("ascii", o + 4, o + 8); const d = buf.subarray(o + 8, o + 8 + len); if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } if (type === "IDAT") idat.push(d); o += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = ct === 6 ? 4 : 3; const stride = w * bpp; const out = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)); const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, bb = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i]; if (f === 1) v += a; else if (f === 2) v += bb; else if (f === 3) v += (a + bb) >> 1; else if (f === 4) { const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c; } cur[i] = v & 255; } prev = cur; }
  let r = 0, g = 0, bl = 0; const n = w * h; for (let i = 0; i < n; i++) { r += out[i * bpp]; g += out[i * bpp + 1]; bl += out[i * bpp + 2]; }
  return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
}
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const vp = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
let bad = 0;
function ratio(a, c) { const L = (x) => { const f = x.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }; const l1 = L(a), l2 = L(c); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
for (const [pref, os, want] of THEMES) {
  const ctx = await b.newContext({ viewport: vp, colorScheme: os, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript((pref) => { try { localStorage.setItem("keplar-theme", pref); localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} }, pref);
  const p = await ctx.newPage();
  for (const route of ROUTES) {
    let res;
    try { res = await p.goto(base + route, { waitUntil: "load", timeout: 45000 }); } catch (e) { console.log(`ERR ${pref}/${os} ${route} ${String(e).slice(0, 80)}`); continue; }
    await p.waitForTimeout(700);
    const url = new URL(p.url()).pathname;
    const r = await p.evaluate(() => {
      const root = document.documentElement;
      const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] }; };
      const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
      const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none" && !/^linear-gradient\(.*rgba?\(/.test("")) { if (/url\(/.test(cs.backgroundImage)) return null; } const c = parse(cs.backgroundColor); if (c && c.a > 0) { chain.push(c); if (c.a >= 1) break; } } let acc = { r: 255, g: 255, b: 255, a: 1 }; if (!chain.length || chain[chain.length - 1].a < 1) acc = getComputedStyle(root).colorScheme.includes("dark") ? { r: 11, g: 11, b: 13, a: 1 } : acc; for (let i = chain.length - 1; i >= 0; i--) acc = over(chain[i], acc); return acc; };
      const low = [];
      const seen = new Set();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const t = n.textContent.trim();
        if (t.length < 2) continue;
        const el = n.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
        const rc = el.getBoundingClientRect();
        if (rc.width < 2 || rc.height < 2 || rc.bottom < 0 || rc.top > innerHeight * 3) continue;
        if (el.closest("[aria-hidden='true'],script,style,noscript,[data-cta='open'],[hidden]")) continue;
        let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
        if (o < 0.05) continue;
        const fg = parse(cs.color); const bg = bgOf(el);
        if (!fg || !bg) continue;
        const f = over({ ...fg, a: fg.a * o }, bg);
        el.setAttribute('data-sw', String(low.length)); low.push({ id: low.length, t: t.slice(0, 40), fg: [f.r, f.g, f.b].map(Math.round), bg: [bg.r, bg.g, bg.b].map(Math.round), size: parseFloat(cs.fontSize), w: +cs.fontWeight, tag: el.tagName });
      }
      return { theme: root.dataset.theme, pref: root.dataset.themePref, scheme: getComputedStyle(root).colorScheme, h: root.scrollWidth > innerWidth + 1, body: parse(getComputedStyle(document.body).backgroundColor), low };
    });
    const issues = [];
    if (r.theme !== want) issues.push(`theme=${r.theme} want ${want}`);
    if (r.h) issues.push("horizontal scroll");
    const need = (x) => (x.size >= 24 || (x.size >= 18.6 && x.w >= 700) ? 3 : 4.5);
    let bads = r.low.map((x) => ({ ...x, c: ratio(x.fg, x.bg) })).filter((x) => x.c < need(x));
    // computed backgrounds miss gradients/images: re-measure the flagged ones from pixels with the text hidden
    const real = [];
    const setC = (id, on) => p.evaluate(async ({ id, on }) => { const el = document.querySelector(`[data-sw="${id}"]`); const all = [el, ...el.querySelectorAll("*")]; for (const c of all) { if (on) c.style.setProperty("color", "transparent", "important"); else c.style.removeProperty("color"); } await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, { id, on });
    for (const x of bads.slice(0, 40)) {
      const loc = p.locator(`[data-sw="${x.id}"]`).first();
      await loc.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(900);
      const b2 = await loc.boundingBox().catch(() => null);
      if (!b2 || b2.width < 2 || b2.height < 2) continue;
      const clip = { x: Math.max(0, b2.x), y: Math.max(0, b2.y), width: Math.min(b2.width, vp.width - Math.max(0, b2.x)), height: Math.min(b2.height, vp.height - Math.max(0, b2.y)) };
      if (clip.width < 2 || clip.height < 2) continue;
      await setC(x.id, true);
      const buf = await p.screenshot({ clip });
      await setC(x.id, false);
      const bg = samplePng(buf);
      const c = ratio(x.fg, bg);
      if (c < need(x)) real.push({ ...x, bg, c });
    }
    bads = real;
    for (const x of bads.slice(0, 6)) issues.push(`contrast ${x.c.toFixed(2)} "${x.t}" ${x.tag} ${x.size}px fg(${x.fg}) bg(${x.bg})`);
    if (bads.length > 6) issues.push(`+${bads.length - 6} more low-contrast`);
    if (res && res.status() >= 500) issues.push("status " + res.status());
    if (shots) await p.screenshot({ path: `${shots}/${(url === "/" ? "home" : url.slice(1).replace(/\//g, "_"))}-${pref}-${os}.png` });
    if (issues.length) { bad++; console.log(`${pref}/${os} ${route}${url !== route ? " -> " + url : ""}\n   ` + issues.join("\n   ")); }
  }
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} pages with issues` : "all ok");
