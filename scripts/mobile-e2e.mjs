// Phone regression checks: node scripts/mobile-e2e.mjs [baseUrl] [--engine=chromium|webkit]
// Needs the local e2e server (scripts/e2e-server.sh: dev outbox + in-memory Postgres). Emulated phones only (360/390/430, touch), never a real device.
//  - home: no sideways scroll, the Creation cards are never cut off by the viewport at any scroll position, cookie card is compact with 44px buttons
//  - /signin, /app, /app/create: text fields are 16px (no iOS zoom), key controls are 44px
//  - /app: the title keeps room in the top bar, the home tiles do not jump when the onboarding card arrives (CLS), and with the soft keyboard
//    "open" (visualViewport shrunk) the app shell, and with it the composer, ends exactly at the top of the keyboard
import { chromium, webkit } from "playwright";
const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) || "http://localhost:3471";
const engine = (args.find((a) => a.startsWith("--engine=")) || "").split("=")[1] || "chromium";
const browser = engine === "webkit" ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let bad = 0;
const ok = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) bad++; };
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
let hop = 0;
async function signIn(ctx, tag) {
  const h = { "content-type": "application/json", origin: base, "x-forwarded-for": `10.96.${(Date.now() >> 3) & 255}.${++hop}` };
  await ctx.request.post(base + "/api/auth/sign-in/magic-link", { headers: h, data: { email: `mobe2e.${tag}.${Date.now().toString(36)}@example.com`, callbackURL: "/app" } });
  const html = await (await ctx.request.get(base + "/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  await ctx.request.post(base + "/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } });
  await ctx.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name: "Alex" } } });
}
const mk = (w, h) => browser.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });

for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
  const tag = `${engine} ${w}`;
  // ── signed out
  const ctx = await mk(w, h);
  const p = await ctx.newPage();
  await p.goto(base + "/", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  const cookie = await p.evaluate(() => { const b = document.querySelector('[role=region][aria-labelledby=cookie-title]'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: r.height, vh: innerHeight, btn: [...b.querySelectorAll("button")].map((x) => Math.round(x.getBoundingClientRect().height)), left: r.left, right: innerWidth - r.right }; });
  ok(cookie && cookie.h / cookie.vh < 0.3, `${tag}: cookie card takes ${cookie ? Math.round((cookie.h / cookie.vh) * 100) : "?"}% of the screen (< 30%)`);
  ok(cookie && cookie.btn.every((x) => x >= 44), `${tag}: cookie buttons are 44px (${cookie?.btn})`);
  await p.getByRole("button", { name: /reject non-essential/i }).click().catch(() => {});
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${tag}: / no sideways scroll`);
  // Creation: cards fully inside the viewport horizontally at every scroll step through the section
  const cut = await p.evaluate(async () => {
    const sec = document.querySelector('section[aria-labelledby="creation-title"]');
    const top = sec.getBoundingClientRect().top + scrollY, hh = sec.offsetHeight;
    const bad = [];
    for (const f of [0, 0.15, 0.4, 0.7, 1]) {
      scrollTo(0, top + (hh - innerHeight) * f);
      await new Promise((r) => setTimeout(r, 700));
      for (const li of sec.querySelectorAll("[data-tile]")) { const r = li.getBoundingClientRect(); if (r.height > 0 && (r.left < -1 || r.right > innerWidth + 1)) bad.push(`${li.getAttribute("data-art")}@${f}:[${Math.round(r.left)},${Math.round(r.right)}]`); }
    }
    return bad;
  });
  ok(cut.length === 0, `${tag}: Creation cards never leave the screen sideways${cut.length ? " -> " + cut.slice(0, 4).join(" ") : ""}`);
  for (const path of ["/signin", "/signup", "/pricing", "/download", "/privacy"]) {
    await p.goto(base + path, { waitUntil: "load" }); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${tag}: ${path} no sideways scroll`);
    const small = await p.evaluate(() => [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select")].filter((e) => e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) < 16).length);
    ok(small === 0, `${tag}: ${path} text fields are >= 16px`);
  }
  await p.goto(base + "/signin", { waitUntil: "load" });
  const nav = await p.evaluate(() => { const t = document.querySelector('header button[aria-label], header [class*="__toggle"]'); const r = t?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null; });
  ok(nav && nav[0] >= 44 && nav[1] >= 44, `${tag}: nav menu button ${nav}`);
  await ctx.close();

  // ── signed in
  const uctx = await mk(w, h);
  await signIn(uctx, `${engine}${w}`);
  const u = await uctx.newPage();
  await u.addInitScript(() => {
    window.__cls = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch {}
  });
  await u.goto(base + "/app", { waitUntil: "load" });
  await u.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 3000 }).catch(() => {});
  await u.waitForSelector("textarea[id$='-input']", { timeout: 20000 });
  await u.waitForTimeout(2500);
  const m = await u.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const ta = q("textarea[id$='-input']");
    const tools = [...document.querySelectorAll('[class*="Composer-module__"][class*="__tool"], [class*="Composer-module__"][class*="__routingBtn"], [class*="Composer-module__"][class*="__send"]')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const title = q('[class*="App-module__"][class*="__topTitle"]').getBoundingClientRect();
    const bar = [...document.querySelectorAll('header [class*="__iconBtn"], header [class*="__upgradeTop"]')].map((e) => Math.round(e.getBoundingClientRect().height));
    return { fs: parseFloat(getComputedStyle(ta).fontSize), toolMin: Math.min(...tools.map((r) => Math.min(r.width, r.height))), titleW: title.width, bar, cls: window.__cls, over: document.documentElement.scrollWidth - innerWidth };
  });
  ok(m.fs >= 16, `${tag}: /app composer font ${m.fs}px (>= 16, no iOS zoom)`);
  ok(m.toolMin >= 44, `${tag}: /app composer controls >= 44px (min ${Math.round(m.toolMin)})`);
  ok(m.titleW >= 60, `${tag}: /app top bar leaves ${Math.round(m.titleW)}px for the title (>= 60)`);
  ok(m.bar.every((x) => x >= 44), `${tag}: /app top bar buttons >= 44px (${m.bar})`);
  ok(m.cls < 0.1, `${tag}: /app layout shift ${m.cls.toFixed(3)} (< 0.1)`);
  ok(m.over <= 1, `${tag}: /app no sideways scroll`);
  // on-screen keyboard (simulated: visualViewport shrinks by 336 px and a field has focus)
  await u.focus("textarea[id$='-input']");
  const kb = await u.evaluate(async () => {
    const vv = window.visualViewport;
    const H = innerHeight, KB = 336;
    Object.defineProperty(vv, "height", { configurable: true, get: () => H - KB });
    vv.dispatchEvent(new Event("resize"));
    await new Promise((r) => setTimeout(r, 300));
    const app = document.querySelector('[class*="App-module__"][class*="__app"]').getBoundingClientRect();
    const ta = document.querySelector("textarea[id$='-input']").getBoundingClientRect();
    const out = { attr: document.documentElement.hasAttribute("data-kb"), appBottom: Math.round(app.bottom), kbTop: H - KB, taBottom: Math.round(ta.bottom) };
    Object.defineProperty(vv, "height", { configurable: true, get: () => H });
    vv.dispatchEvent(new Event("resize"));
    await new Promise((r) => setTimeout(r, 300));
    out.restored = !document.documentElement.hasAttribute("data-kb") && Math.round(document.querySelector('[class*="App-module__"][class*="__app"]').getBoundingClientRect().bottom) === H;
    return out;
  });
  ok(kb.attr && kb.appBottom === kb.kbTop && kb.taBottom <= kb.kbTop, `${tag}: keyboard open -> app shell ends at ${kb.appBottom} (keyboard top ${kb.kbTop}), composer text bottom ${kb.taBottom}`);
  ok(kb.restored, `${tag}: keyboard closed -> shell back to full height`);
  await uctx.close();
}
await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nall ok");
process.exit(bad ? 1 : 0);
