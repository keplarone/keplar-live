#!/usr/bin/env node
// Light-theme audit screenshots (desktop 1280x800 + phone 390x844): marketing (home hero + chapters, features, pricing, about, docs,
// blogs, guides) and the signed-in app (Ask welcome, sidebar, account menu, Cmd-K, Create, Settings).
//   node scripts/light-shots.mjs <base> <outdir> [marketing,app] [theme]
// base needs KEPLAR_DEV_TOOLS=1 (magic-link outbox). One headless browser at a time (memory is tight).
import fs from "node:fs";
import * as pw from "playwright";
const [base = "http://localhost:3490", out = "screenshots/light/before", only = "", theme = "light"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const exe = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const VIEWPORTS = [[1280, 800, "desktop"], [390, 844, "phone"]];
const want = (k) => !only || only.split(",").includes(k);
const shot = async (page, name, opts = {}) => { const p = `${out}/${name}.png`; await page.screenshot({ path: p, ...opts }).catch((e) => console.log("shot failed", name, e.message)); console.log(p); };
const settle = (page, ms = 1800) => page.waitForTimeout(ms);
const ip = () => `10.89.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
async function newCtx(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  await ctx.addCookies([
    { name: "keplar_consent", value: encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } })), url: base },
    { name: "keplar-theme", value: theme, url: base },
  ]);
  await ctx.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); } catch {} }, theme);
  return ctx;
}
if (want("marketing")) for (const [w, h, vp] of VIEWPORTS) {
  const ctx = await newCtx(w, h);
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "load", timeout: 180_000 });
  await settle(page, 5000);
  await shot(page, `home-hero-${vp}`);
  // a chapter and the pricing block further down
  await page.evaluate(() => { const c = document.querySelector("[data-chapter]"); c?.scrollIntoView(); });
  await settle(page, 1500);
  await shot(page, `home-chapter-${vp}`);
  await page.evaluate(() => { const p = document.querySelector("#pricing, [id*=pricing]"); p?.scrollIntoView(); });
  await settle(page, 1500);
  await shot(page, `home-pricing-${vp}`);
  for (const path of ["/features", "/pricing", "/about", "/docs", "/blogs", "/guides"]) {
    await page.goto(base + path, { waitUntil: "load", timeout: 180_000 }).catch((e) => console.log("goto failed", path, e.message));
    await settle(page, 2200);
    await shot(page, `${path.slice(1)}-${vp}`);
    if (path === "/pricing" || path === "/features") await shot(page, `${path.slice(1)}-${vp}-full`, { fullPage: true });
  }
  await ctx.close();
}
if (want("app")) {
  const ctx = await newCtx(1280, 800);
  const page = await ctx.newPage();
  const email = `light-${Date.now().toString(36)}@example.com`;
  await page.goto(base + "/signin?next=%2Fapp", { timeout: 180_000 });
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href = null;
  for (let i = 0; i < 40 && !href; i++) {
    await page.waitForTimeout(1000);
    await page.goto(base + "/dev/outbox");
    href = (await page.locator("a[href*='/signin/verify']").evaluateAll((as, em) => as.filter((a) => (a.parentElement?.parentElement?.textContent ?? "").includes(`to ${em}`)).map((a) => a.href), email))[0] ?? null;
  }
  if (!href) throw new Error("no magic link");
  await page.goto(href);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(app|welcome)/, { timeout: 90_000 });
  await settle(page, 2500);
  const skipFirst = async () => { for (let i = 0; i < 3; i++) { const skip = page.locator("button, a", { hasText: /^(Skip|Skip setup|Skip for now)$/ }).first(); if (await skip.isVisible().catch(() => false)) { await skip.click(); await settle(page, 900); } else break; } };
  await skipFirst();
  for (const [w, h, vp] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(base + "/app/ask", { waitUntil: "load", timeout: 180_000 });
    await settle(page, 3500);
    await skipFirst();
    await shot(page, `app-ask-${vp}`);
    if (vp === "phone") {
      const open = page.locator("button[aria-label*='sidebar' i], button[aria-label*='menu' i]").first();
      if (await open.count()) { await open.click(); await settle(page, 700); await shot(page, `app-sidebar-${vp}`); await page.keyboard.press("Escape"); }
    } else {
      const ta = page.locator("textarea").first();
      if (await ta.count()) { await ta.click(); await ta.type("How do tides work?", { delay: 10 }); await settle(page, 400); await shot(page, `app-ask-typed-${vp}`); await ta.fill(""); }
      const acct = page.locator("[data-account-menu] > button").first();
      if (await acct.count()) { await acct.click(); await settle(page, 600); await shot(page, `app-account-menu-${vp}`); await page.keyboard.press("Escape"); await settle(page, 300); }
      await page.keyboard.press("Control+k"); await settle(page, 700); await shot(page, `app-cmdk-${vp}`); await page.keyboard.press("Escape"); await settle(page, 300);
    }
    await page.goto(base + "/app/create", { waitUntil: "load", timeout: 180_000 });
    await settle(page, 3500);
    await shot(page, `app-create-${vp}`);
    await page.goto(base + "/account", { waitUntil: "load", timeout: 180_000 });
    await settle(page, 2500);
    await shot(page, `settings-${vp}`);
  }
  await ctx.close();
}
await browser.close();
