// Mobile audit: node scripts/mobile-audit.mjs [baseUrl] [--engine=chromium|webkit] [--out=dir] [--routes=a,b] [--shots] [--matrix=phones|tablets|desktops|short|zoom|all]
// Emulates 360/390/430 px phones (touch, mobile UA; WebKit engine for iOS Safari-like layout) against the local e2e server
// (scripts/e2e-server.sh: in-memory Postgres + dev outbox). Reports: horizontal overflow, elements poking outside the viewport,
// clipped text, tap targets < 44 px, inputs < 16 px (iOS zoom), fixed/sticky bars. Nothing here is a real phone.
import { chromium, webkit } from "playwright";
import fs from "node:fs";
const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) || "http://localhost:3470";
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const engine = opt("engine", "chromium");
const out = opt("out", "/tmp/mobaudit");
const only = opt("routes", "");
const SHOTS = args.includes("--shots");
fs.mkdirSync(out, { recursive: true });
// Device matrix. touch=false entries are laptops/desktops (no tap-target / iOS-zoom checks); zoom emulates browser zoom (CSS viewport shrinks, DPR grows);
// textScale injects a larger root font size (what the browser's "text size" setting does for rem-based layouts).
const MATRICES = {
  phones: [[360, 780], [390, 844], [430, 932]].map(([w, h]) => ({ name: `${w}`, w, h, touch: true, dpr: 3 })),
  tablets: [
    { name: "744p", w: 744, h: 1133, touch: true, dpr: 2 }, { name: "744l", w: 1133, h: 744, touch: true, dpr: 2 },
    { name: "820p", w: 820, h: 1180, touch: true, dpr: 2 }, { name: "820l", w: 1180, h: 820, touch: true, dpr: 2 },
    { name: "1024p", w: 1024, h: 1366, touch: true, dpr: 2 }, { name: "1024l", w: 1366, h: 1024, touch: true, dpr: 2 },
  ],
  desktops: [
    { name: "laptop1280", w: 1280, h: 720, touch: false, dpr: 2 }, { name: "laptop1440", w: 1440, h: 900, touch: false, dpr: 2 },
    { name: "fhd1920", w: 1920, h: 1080, touch: false, dpr: 1 }, { name: "uw2560", w: 2560, h: 1080, touch: false, dpr: 1 }, { name: "qhd2560", w: 2560, h: 1440, touch: false, dpr: 1 },
  ],
  short: [
    { name: "phone-land-844x390", w: 844, h: 390, touch: true, dpr: 3 }, { name: "phone-land-740x360", w: 740, h: 360, touch: true, dpr: 3 },
    { name: "desk-1280x500", w: 1280, h: 500, touch: false, dpr: 1 }, { name: "tab-land-1024x600", w: 1024, h: 600, touch: true, dpr: 2 },
  ],
  zoom: [
    { name: "desk-200%", w: 1280, h: 800, touch: false, dpr: 1, zoom: 2 }, { name: "desk-300%", w: 1280, h: 800, touch: false, dpr: 1, zoom: 3 },
    { name: "desk-400%", w: 1280, h: 1024, touch: false, dpr: 1, zoom: 4 }, { name: "phone-text200%", w: 390, h: 844, touch: true, dpr: 3, textScale: 2 },
    { name: "tab-text200%", w: 820, h: 1180, touch: true, dpr: 2, textScale: 2 },
  ],
};
MATRICES.all = Object.values(MATRICES).flat();
const DEVICES = MATRICES[opt("matrix", "phones")];
const UA_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const browser = engine === "webkit" ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });

let hop = 0;
async function signIn(ctx, email) {
  const h = { "content-type": "application/json", origin: base, "x-forwarded-for": `10.88.${(Date.now() >> 3) & 255}.${++hop}` };
  let r = await ctx.request.post(base + "/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } });
  if (!r.ok()) throw new Error("magic " + r.status());
  const html = await (await ctx.request.get(base + "/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  r = await ctx.request.post(base + "/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } });
  if (!r.ok()) throw new Error("confirm " + r.status());
  await ctx.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name: "Alex" } } });
}

const PUBLIC = ["/", "/pricing", "/about", "/download", "/help", "/signin", "/signup", "/simulation", "/privacy", "/terms", "/security", "/how-it-works", "/agents", "/enterprise", "/contact", "/status", "/changelog", "/blogs", "/docs", "/vs", "/vs/chatgpt", "/compare", "/use-cases", "/for-founders", "/models"];
const SIGNED = ["/account", "/app", "/app/create", "/app/slides", "/app/study"];

const probe = () => {
  const vw = document.documentElement.clientWidth;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
  const sel = (e) => { let s = e.tagName.toLowerCase(); if (e.id) s += "#" + e.id; const c = (typeof e.className === "string" ? e.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join("."); if (c) s += "." + c; const t = (e.textContent || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30); return s + (t ? ` "${t}"` : ""); };
  // inside a horizontal scroller (intentional), or aria-hidden decorative / offscreen-by-design
  const inScroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p !== document.body && p !== document.documentElement) return true; } return false; };
  const deco = (e) => !!e.closest("[aria-hidden=true], canvas, svg, [inert]");
  const res = { vw, docW: document.documentElement.scrollWidth, over: document.documentElement.scrollWidth - vw, poking: [], clipped: [], small: [], inputs: [], fixed: [], imgs: [] };
  const all = [...document.body.querySelectorAll("*")];
  for (const e of all) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    if (cs.position === "fixed" || cs.position === "sticky") {
      if (!deco(e) || r.height > 4) res.fixed.push({ s: sel(e), pos: cs.position, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width), vh: innerHeight });
    }
    if (!deco(e) && !inScroller(e) && (r.right > vw + 1 || r.left < -1) && !["HTML", "BODY"].includes(e.tagName) && !(cs.position === "fixed")) {
      if (res.poking.length < 12) res.poking.push({ s: sel(e), l: Math.round(r.left), r: Math.round(r.right) });
    }
    // clipped text: overflow hidden/clip box whose content is wider/taller than the box and has text
    if (!deco(e) && /(hidden|clip)/.test(cs.overflowX + cs.overflowY) && cs.textOverflow !== "ellipsis" && e.childNodes.length) {
      const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || (e.children.length && (e.textContent || "").trim().length > 0);
      if (hasText && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2) && e.clientWidth > 0 && e.clientHeight > 0) {
        res.clipped.push({ s: sel(e), cw: e.clientWidth, sw: e.scrollWidth, ch: e.clientHeight, sh: e.scrollHeight });
      }
    }
    if (e.matches("a[href], button, [role=button], [role=tab], [role=menuitem], summary, input:not([type=hidden]), select, textarea, label[for]") && !deco(e)) {
      // WCAG 2.5.8 inline exception: a link inside a sentence
      const sib = e.parentElement ? [...e.parentElement.childNodes].some((n) => n !== e && n.nodeType === 3 && n.textContent.trim().length > 2) : false;
      const inline = e.tagName === "A" && (cs.display === "inline" || sib);
      const w = Math.round(r.width), h = Math.round(r.height);
      const hasText = (e.textContent || "").trim().length > 0 && !e.querySelector("svg:only-child");
      // 44 tall always; narrower than 44 is fine for a text label (a word is as wide as it is), not for an icon-only control
      if ((h < 44 || (w < 44 && !hasText)) && !(e.tagName === "LABEL") && !(e.type === "checkbox" || e.type === "radio") ) {
        // visually-hidden skip links etc.
        if (!(r.width <= 1 || r.height <= 1)) res.small.push({ s: sel(e), w, h, inline, y: Math.round(r.top + scrollY) });
      }
    }
    if (e.matches("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=submit]):not([type=button]), select, textarea") && parseFloat(cs.fontSize) < 16) res.inputs.push({ s: sel(e), fs: cs.fontSize });
    if (e.matches("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=submit]):not([type=button]), select, textarea") && parseFloat(cs.fontSize) > 16.5) res.bigInputs = (res.bigInputs || []).concat({ s: sel(e), fs: cs.fontSize });
    if (e.tagName === "IMG") { const nw = e.naturalWidth; if (nw && nw > r.width * 3.2 && nw > 600) res.imgs.push({ s: (e.currentSrc || e.src).slice(-60), nat: nw, shown: Math.round(r.width) }); }
  }
  // text actually cut off: a text node whose box is clipped (>3px) by an overflow:hidden/clip ancestor, or sits outside the viewport
  res.cut = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest("[aria-hidden=true], canvas, svg, script, style, noscript, [inert], .visually-hidden, [class*=srOnly], [hidden]")) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const r = rg.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs0 = getComputedStyle(el);
    if (cs0.visibility === "hidden" || cs0.opacity === "0" || cs0.display === "none") continue;
    let clipBy = null, scrolls = false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (parseFloat(cs.opacity) === 0 || cs.visibility === "hidden") { clipBy = null; scrolls = true; break; }
      if (p !== document.body && /(auto|scroll)/.test(cs.overflowX)) { scrolls = true; break; }
      if (p !== document.body && /(hidden|clip)/.test(cs.overflowX + cs.overflowY)) {
        const pr = p.getBoundingClientRect();
        if (r.left < pr.left - 3 || r.right > pr.right + 3 || (r.top < pr.top - 3 && /(hidden|clip)/.test(cs.overflowY)) || (r.bottom > pr.bottom + 3 && /(hidden|clip)/.test(cs.overflowY))) { clipBy = p; break; }
      }
    }
    const outside = !scrolls && (r.left < -3 || r.right > vw + 3);
    if ((clipBy && r.bottom > 0 && r.top < innerHeight * 40) || outside) {
      if (res.cut.length < 40) res.cut.push({ t: n.textContent.trim().slice(0, 30), by: clipBy ? sel(clipBy).slice(0, 50) : "viewport", l: Math.round(r.left), r: Math.round(r.right), y: Math.round(r.top + scrollY) });
    }
  }
  // dedupe
  const uniq = (a, k) => { const m = new Map(); for (const x of a) m.set(k(x), x); return [...m.values()]; };
  res.small = uniq(res.small, (x) => x.s);
  res.clipped = uniq(res.clipped, (x) => x.s);
  res.fixed = uniq(res.fixed, (x) => x.s);
  res.docH = document.documentElement.scrollHeight;
  return res;
};

async function ctxFor(d, storageState) {
  const z = d.zoom || 1, w = Math.round(d.w / z), h = Math.round(d.h / z);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: d.dpr * z, isMobile: d.touch, hasTouch: d.touch, ...(d.touch ? { userAgent: UA_IOS } : {}), reducedMotion: "no-preference", storageState });
  if (d.textScale) await ctx.addInitScript((k) => { const st = document.createElement("style"); st.textContent = `html{font-size:${k * 100}% !important}`; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(st)); }, d.textScale);
  return ctx;
}

const results = [];
async function audit(ctx, route, w, h, label) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await p.goto(base + route, { waitUntil: "load", timeout: 45000 }).catch((e) => errs.push("goto " + e.message.slice(0, 80)));
  await p.waitForTimeout(1500);
  // dismiss cookie banner after measuring it
  const r0 = await p.evaluate(probe).catch((e) => ({ err: String(e) }));
  if (SHOTS) await p.screenshot({ path: `${out}/${engine}-${w}-${label}.png`, fullPage: false }).catch(() => {});
  if (SHOTS) await p.screenshot({ path: `${out}/${engine}-${w}-${label}-full.png`, fullPage: true }).catch(() => {});
  const dev = DEVICES.find((x) => x.name === w);
  if (r0 && dev && !dev.touch) { r0.small = []; r0.inputs = []; }
  // a fixed/sticky bar taller than 40% of a short window leaves too little room for the page
  if (r0?.fixed) r0.tallBars = r0.fixed.filter((f) => f.pos === "fixed" && f.w > r0.vw * 0.6 && f.h > f.vh * 0.4 && f.h < f.vh * 0.98);
  results.push({ route, w, engine, ...r0, errs });
  await p.close();
}

const anonCtx = {}, userCtx = {};
const seedCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: UA_IOS });
await signIn(seedCtx, `mob.${engine}.${Date.now().toString(36)}@example.com`);
const userState = await seedCtx.storageState();
for (const d of DEVICES) {
  anonCtx[d.name] = await ctxFor(d);
  userCtx[d.name] = await ctxFor(d, userState);
}
// a published site for /s/<slug>
let slug = null;
try {
  const hdr = { "content-type": "application/json", origin: base };
  const c = await seedCtx.request.post(base + "/api/sites", { headers: hdr, data: { name: "Mill Lane Bakery", template: "business" } });
  const { site } = await c.json();
  await seedCtx.request.post(base + `/api/sites/${site.id}/publish`, { headers: hdr, data: {} });
  slug = site.slug;
} catch (e) { console.log("site creation failed", e.message); }

let routes = [...PUBLIC.map((r) => ["a", r]), ...SIGNED.map((r) => ["u", r])];
if (slug) routes.push(["a", `/s/${slug}`]);
if (only) routes = routes.filter(([, r]) => only.split(",").includes(r));
for (const d of DEVICES) {
  const [w, h] = [d.name, d.h];
  for (const [who, r] of routes) await audit(who === "a" ? anonCtx[w] : userCtx[w], r, w, h, r.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home");
}
fs.writeFileSync(`${out}/${engine}.json`, JSON.stringify(results, null, 1));
let bad = 0;
for (const r of results) {
  const probs = [];
  if (r.err) probs.push("ERR " + r.err.slice(0, 80));
  if (r.over > 1) probs.push(`H-OVERFLOW ${r.over}px`);
  if (r.cut?.length) probs.push(`CUT-TEXT (${r.cut.length}): ${r.cut.slice(0, 5).map((x) => `"${x.t}" by ${x.by} [${x.l},${x.r}] y${x.y}`).join(" | ")}`);
  if (r.poking?.length) probs.push(`poking:${r.poking.slice(0, 4).map((x) => `${x.s}[${x.l},${x.r}]`).join(" | ")}`);
  if (r.clipped?.filter((c) => c.cw > 2 && c.ch > 2).length) probs.push(`clipped:${r.clipped.slice(0, 4).map((x) => `${x.s}(${x.cw}x${x.ch}<${x.sw}x${x.sh})`).join(" | ")}`);
  const sm = (r.small || []).filter((x) => !x.inline);
  if (sm.length) probs.push(`tap<44 (${sm.length}): ${sm.slice(0, 6).map((x) => `${x.s}${x.w}x${x.h}`).join(" | ")}`);
  if (r.tallBars?.length) probs.push(`tall fixed bar: ${r.tallBars.map((x) => `${x.s} ${x.h}/${x.vh}`).join(" | ")}`);
  if (r.inputs?.length) probs.push(`input<16: ${r.inputs.map((x) => x.s + x.fs).join(" | ")}`);
  if (r.errs?.length) probs.push("js: " + r.errs.join(";"));
  if (probs.length) { bad++; console.log(`\n[${r.engine} ${r.w}] ${r.route}\n  ` + probs.join("\n  ")); }
}
console.log(`\n${results.length} cells, ${bad} with findings. slug=${slug}. JSON: ${out}/${engine}.json`);
await browser.close();
