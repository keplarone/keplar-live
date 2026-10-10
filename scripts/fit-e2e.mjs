// Text-fit regression: node scripts/fit-e2e.mjs [baseUrl] [--signed-only] [--signed-out-only] [--routes=/a,/b] [--quick]
// Walks every visible control and frame (button, link pill, chip, tab, badge, input, select, card, plan card) on the key routes at
// phone / tablet / laptop / full-HD sizes and at 200% browser zoom (CSS viewport halved, device scale 2), in both themes, signed out and
// signed in (needs the local e2e server for /dev/outbox), plus the desktop-app user agent. It flags:
//   clip     - label text sticks out of its frame (Range rects vs the frame box) or the frame scrolls (scrollWidth > clientWidth)
//   partial  - text is cut in half by an overflow:hidden box
//   hclip    - text is cut by an ancestor with overflow hidden/clip
//   wrap     - a one-line control (pill, tab, chip) wraps onto a second line
//   tiny     - rendered text is smaller than 10px
//   ellipsis - text is truncated with an ellipsis but has no title / aria-label to read it in full
import { chromium } from "playwright";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) || "http://localhost:3470";
const SIGNED_ONLY = args.includes("--signed-only");
const OUT_ONLY = args.includes("--signed-out-only");
const QUICK = args.includes("--quick");
const routesArg = args.find((a) => a.startsWith("--routes="));
const ROUTES = routesArg ? routesArg.slice(9).split(",") : ["/", "/pricing", "/download", "/agents", "/enterprise", "/about", "/models", "/signin", "/signup", "/docs", "/blogs", "/vs", "/glossary", "/prompts", "/inquire", "/feedback", "/guides", "/for-you", "/how-it-works", "/privacy", "/app"];
// "path|Click 1|Click 2": load the path, then click those labels in order (the Create template picker lives behind them)
const SIGNED_ROUTES = ["/app", "/account", "/app|Create|Start from a template"];
const VPS = QUICK ? [[320, 640, 1], [1366, 768, 1]] : [[320, 640, 1], [390, 844, 3], [768, 1024, 1], [1366, 768, 1], [1920, 1080, 1], [683, 384, 2], [960, 540, 2]];
const THEMES = QUICK ? ["dark"] : ["light", "dark"];
const DESKTOP_UA = " keplar-desktop/1.0";
const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let bad = 0, total = 0;

/** runs in the page: returns the list of problems */
function audit() {
  const out = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05 && !el.closest("[hidden],[aria-hidden='true']:not(button):not(a)") && !el.closest("canvas"); };
  const isSr = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return (r.width <= 1 && r.height <= 1) || cs.clip === "rect(0px, 0px, 0px, 0px)" || el.closest(".sr-only,.visually-hidden,[class*='srOnly'],[class*='sr-only']"); };
  const hasBox = (cs) => { const bg = cs.backgroundColor; const a = /rgba\(.*,\s*([\d.]+)\)$/.exec(bg); const solid = bg !== "transparent" && !(a && +a[1] < 0.04); const bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth); return solid || bw > 0 || cs.backgroundImage !== "none"; };
  const describe = (el) => { const c = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : ""; return `${el.tagName.toLowerCase()}${c ? "." + c : ""}${el.id ? "#" + el.id : ""}`; };
  const textRects = (el) => {
    const rects = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const pe = n.parentElement;
      if (pe && (!vis(pe) || isSr(pe))) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const q of r.getClientRects()) if (q.width > 0.5 && q.height > 0.5) rects.push({ l: q.left, r: q.right, t: q.top, b: q.bottom, n });
    }
    return rects;
  };
  const clipAncestor = (el, stop) => { for (let a = el; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (/(hidden|clip)/.test(cs.overflowX) && a !== document.documentElement) return a; if (a === stop) break; } return null; };
  const seen = new Set();
  const flag = (kind, el, info) => { const key = kind + describe(el) + (el.textContent || "").trim().slice(0, 24); if (seen.has(key)) return; seen.add(key); out.push({ kind, el: describe(el), text: (el.innerText || el.value || el.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 48), ...info }); };

  // 1) controls and frames
  const sel = "button, a[href], [role='button'], [role='tab'], [role='menuitem'], [role='option'], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, label, summary, [class*='chip'], [class*='pill'], [class*='badge'], [class*='tag'], [class*='card'], [class*='plan'], [class*='tab']";
  for (const el of document.querySelectorAll(sel)) {
    if (!vis(el) || isSr(el)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.bottom < -50 || r.top > 20000) continue;
    if (el.tagName === "A" && !hasBox(cs) && !el.matches("[class*='pill'],[class*='chip'],[class*='btn'],[class*='button']")) {
      // plain text links: only check they are not clipped by an ancestor
    }
    const framed = hasBox(cs) || /^(BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName) || el.getAttribute("role") === "tab";
    const single = (el.tagName === "INPUT" || el.tagName === "SELECT");
    // inputs: the typed/placeholder text is not a text node; compare scrollWidth for the value
    if (single) { if (el.scrollWidth - el.clientWidth > 1 && el.type !== "range") flag("clip", el, { by: el.scrollWidth - el.clientWidth, why: "input content wider than the field" }); continue; }
    const tr = textRects(el);
    if (!tr.length) continue;
    const padR = parseFloat(cs.paddingRight), padL = parseFloat(cs.paddingLeft), bw = parseFloat(cs.borderLeftWidth);
    const left = Math.min(...tr.map((x) => x.l)), right = Math.max(...tr.map((x) => x.r)), top = Math.min(...tr.map((x) => x.t)), bottom = Math.max(...tr.map((x) => x.b));
    if (framed) {
      if ((right > r.right + 1.5 || left < r.left - 1.5) && !/(auto|scroll)/.test(cs.overflowX)) flag("clip", el, { by: Math.round(Math.max(right - r.right, r.left - left)), why: "text outside its frame (horizontal)" }); // a framed scroller reaches its text by scrolling
      else if (cs.overflowY !== "visible" && (bottom > r.bottom + 2 || top < r.top - 2)) flag("clip", el, { by: Math.round(Math.max(bottom - r.bottom, r.top - top)), why: "text outside its frame (vertical)" });
      if (/(hidden|clip)/.test(cs.overflowX) && el.scrollWidth - el.clientWidth > 1 && cs.textOverflow !== "ellipsis") flag("clip", el, { by: el.scrollWidth - el.clientWidth, why: "scrollWidth > clientWidth" });
      if (cs.textOverflow === "ellipsis" && el.scrollWidth - el.clientWidth > 1 && !el.title && !el.getAttribute("aria-label") && !el.closest("[title]")) flag("ellipsis", el, { by: el.scrollWidth - el.clientWidth, why: "truncated without title" });
      const pillish = parseFloat(cs.borderTopLeftRadius) >= 90 && r.height < 90; // a true stadium pill; soft rectangles may wrap
      if ((pillish || el.getAttribute("role") === "tab") && cs.whiteSpace !== "pre-wrap") {
        // one text node spanning several line boxes = the label itself wraps (separate spans stacked on purpose do not count)
        const perNode = new Map();
        for (const x of tr) { if (!perNode.has(x.n)) perNode.set(x.n, new Set()); perNode.get(x.n).add(Math.round(x.t / 6)); }
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
        for (const [n, tops] of perNode) if (tops.size > 1 && (n.textContent.trim().split(/\s+/).length > 0)) {
          const spread = Math.max(...[...tops]) - Math.min(...[...tops]);
          if (spread * 6 >= lh * 0.8) { flag("wrap", el, { by: Math.round(bottom - top), why: `label wraps onto ${tops.size} lines` }); break; }
        }
      }
    }
    // clipped by an ancestor with overflow hidden (any element with text)
    const ca = clipAncestor(el, null);
    let moving = false; for (let a = el; a && a !== ca; a = a.parentElement) if ((getComputedStyle(a).transform !== "none" || getComputedStyle(a).transformStyle === "preserve-3d" || getComputedStyle(a).perspective !== "none")) moving = true;
    if (ca && ca !== el && !moving) { const cr = ca.getBoundingClientRect(); if (cr.width > 0 && (right > cr.right + 1.5 || left < cr.left - 1.5) && right > 0 && left < innerWidth) { if (getComputedStyle(ca).overflowX !== "auto" && !ca.matches("[class*='marquee'],[class*='ticker'],[class*='track'],[class*='carousel'],[class*='rail']")) flag("hclip", el, { by: Math.round(Math.max(right - cr.right, cr.left - left)), why: "cut by " + describe(ca) }); } }
  }
  // 1b) text cut in half by an overflow:hidden box (a whole hidden line is fine, a half-visible one is not)
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (!/(hidden|clip)/.test(cs.overflowX + cs.overflowY) || cs.textOverflow === "ellipsis" || !vis(el) || isSr(el)) continue;
    if (el.matches("[class*='marquee'],[class*='ticker'],[class*='track'],[class*='carousel'],[class*='rail']") || el.closest("canvas,svg")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    let moving = false; for (let a = el; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).transform !== "none" || getComputedStyle(a).transformStyle === "preserve-3d" || getComputedStyle(a).perspective !== "none") { moving = true; break; }
    if (moving) continue;
    for (const x of textRects(el)) {
      let inScroller = false; for (let a = x.n.parentElement; a && a !== el; a = a.parentElement) { const c2 = getComputedStyle(a); if (/(auto|scroll)/.test(c2.overflowX + c2.overflowY)) { inScroller = true; break; } }
      let animated = false; for (let a = x.n.parentElement; a && a !== el.parentElement; a = a.parentElement) { const c3 = getComputedStyle(a); if (c3.transform !== "none" || c3.transformStyle === "preserve-3d" || c3.perspective !== "none") { animated = true; break; } }
      if (animated) continue; // scroll-driven 3D layers move on purpose
      if (inScroller) continue; // text that lives in a nested scrolling area is reachable by scrolling
      const h = Math.min(x.b, r.bottom) - Math.max(x.t, r.top), w2 = Math.min(x.r, r.right) - Math.max(x.l, r.left);
      if (h <= 0 || w2 <= 0) continue; // entirely outside (hidden line / hidden item) or off-screen: fine
      const cutY = (x.b - x.t) - h, cutX = (x.r - x.l) - w2;
      if (cutY > 2 || cutX > 2) { flag("partial", el, { by: Math.round(Math.max(cutX, cutY)), why: "text half-visible inside an overflow:hidden box" }); break; }
    }
  }
  // 2) tiny text
  for (const el of document.querySelectorAll("body *")) {
    if (!el.childNodes.length) continue;
    let direct = false; for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { direct = true; break; }
    if (!direct || !vis(el) || isSr(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 10 && !el.closest("canvas,svg")) flag("tiny", el, { by: fs, why: `font-size ${fs}px` });
  }
  // 3) page-level horizontal overflow
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.push({ kind: "clip", el: "html", text: "", by: de.scrollWidth - de.clientWidth, why: "page scrolls sideways" });
  return out;
}

async function run(tag, ctx, routes) {
  for (const spec of routes) {
    const [path, ...steps] = spec.split("|");
    const p = await ctx.newPage();
    await p.goto(base + path, { waitUntil: "load" }).catch(() => {});
    await p.waitForTimeout(path.startsWith("/app") ? 1600 : 1000);
    let reached = true;
    for (const label of steps) {
      const nm = label === "Create" ? /^Create$/ : label;
      const hit = p.getByRole("button", { name: nm }).or(p.getByRole("tab", { name: nm })).first();
      try { await hit.click({ timeout: 2500 }); await p.waitForTimeout(700); }
      catch { // narrow screens keep the sidebar closed: open it, then try again
        try { await p.getByRole("button", { name: /open sidebar/i }).first().click({ timeout: 1500 }); await p.waitForTimeout(500); await hit.click({ timeout: 2500 }); await p.waitForTimeout(700); } catch { reached = false; break; } }
    }
    if (steps.length && !reached) { console.log("skip ", `${tag} ${spec} (could not open: ${steps.join(" > ")})`); await p.close(); continue; }
    // open lazy content: scroll the page once so sections mount
    await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); }).catch(() => {});
    await p.waitForTimeout(250);
    const res = await p.evaluate(audit).catch((e) => [{ kind: "error", el: "audit", text: String(e).slice(0, 80), by: 0, why: "audit failed" }]);
    total++;
    if (!res.length) console.log("ok  ", `${tag} ${spec}`);
    for (const r of res) { bad++; console.log("FAIL", `${tag} ${spec} [${r.kind}] ${r.el} "${r.text}" by ${r.by}px: ${r.why}`); }
    await p.close();
  }
}

if (!SIGNED_ONLY) {
  for (const theme of THEMES) for (const [w, h, dpr] of VPS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 500, colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} }, theme);
    await run(`${theme} ${w}x${h}@${dpr}`, ctx, ROUTES.filter((r) => !r.startsWith("/app") || true));
    await ctx.close();
  }
  if (!QUICK) {
    const baseUA = await (async () => { const c = await b.newContext(); const pg = await c.newPage(); const ua = await pg.evaluate(() => navigator.userAgent); await c.close(); return ua; })();
    for (const [w, h, dpr] of [[1366, 768, 1], [1920, 1080, 1]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, userAgent: baseUA + DESKTOP_UA });
      await run(`desktop-app ${w}x${h}@${dpr}`, ctx, ["/", "/pricing", "/download", "/signin", "/app"]);
      await ctx.close();
    }
  }
}

async function signIn(ctx, email, name) {
  const h = { "content-type": "application/json", origin: base, "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const r1 = await ctx.request.post(base + "/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } });
  if (!r1.ok()) throw new Error("magic link " + r1.status());
  const html = await (await ctx.request.get(base + "/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  if (!link) throw new Error("no sign-in link in /dev/outbox");
  const r2 = await ctx.request.post(base + "/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } });
  if (!r2.ok()) throw new Error("confirm " + r2.status());
  await ctx.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name } } });
}
const outbox = OUT_ONLY ? 0 : await fetch(base + "/dev/outbox").then((r) => r.status).catch(() => 0);
if (!OUT_ONLY && outbox !== 200) console.log(`skip signed-in checks (no /dev/outbox on ${base})`);
else if (!OUT_ONLY) {
  const stamp = Date.now() % 1e6; let n = 0;
  const baseUA = await (async () => { const c = await b.newContext(); const pg = await c.newPage(); const ua = await pg.evaluate(() => navigator.userAgent); await c.close(); return ua; })();
  for (const desktop of QUICK ? [false] : [false, true]) for (const theme of THEMES) for (const [w, h, dpr] of VPS) {
    if (desktop && !(w === 1366 || w === 1920)) continue;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 500, colorScheme: theme, ...(desktop ? { userAgent: baseUA + DESKTOP_UA } : {}) });
    await ctx.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); } catch {} }, theme);
    try { await signIn(ctx, `fit${stamp}x${n++}@example.com`, "Alex Rivera"); await run(`signed-in ${theme} ${w}x${h}@${dpr}${desktop ? " desktop-app" : ""}`, ctx, SIGNED_ROUTES); }
    catch (e) { bad++; console.log("FAIL", `signed-in ${w}x${h}: ${e.message}`); }
    await ctx.close();
  }
}
console.log(`\n${total} page audits, ${bad} problem${bad === 1 ? "" : "s"}`);
await b.close();
process.exit(bad ? 1 : 0);
