#!/usr/bin/env node
// Minimal-pass audit screenshots: marketing chrome, home, /features, /pricing, the /app shell, Settings, Create, Agents, Business, Projects,
// at desktop 1280x800 and phone 390x844. Also writes metrics.json (nav items, footer links, sidebar items, tabs, home height).
//   node scripts/minimal-shots.mjs <base> <outdir>      (base needs KEPLAR_DEV_TOOLS=1 for the magic-link outbox)
// One headless browser at a time (memory is tight).
import fs from "node:fs";
import * as pw from "playwright";
const [base = "http://localhost:3480", out = "screenshots/minimal/before", only = ""] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const exe = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const metrics = {};
const VIEWPORTS = [[1280, 800, "desktop"], [390, 844, "phone"]];
const want = (k) => !only || only.split(",").includes(k);
const shot = async (page, name, opts = {}) => { const p = `${out}/${name}.png`; await page.screenshot({ path: p, ...opts }).catch((e) => console.log("shot failed", name, e.message)); console.log(p); };
const settle = (page, ms = 1800) => page.waitForTimeout(ms);
const ip = () => `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

async function newCtx(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "dark", extraHTTPHeaders: { "x-forwarded-for": ip() } });
  await ctx.addCookies([{ name: "keplar_consent", value: encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } })), url: base }]);
  return ctx;
}

// ── marketing (signed out) ──
if (want("marketing")) for (const [w, h, vp] of VIEWPORTS) {
  const ctx = await newCtx(w, h);
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "load", timeout: 120_000 });
  await settle(page, 4000);
  await shot(page, `home-${vp}-top`);
  const m = await page.evaluate(() => ({
    navTop: document.querySelectorAll("header nav ul > li").length,
    navLabels: [...document.querySelectorAll("header nav ul > li > a, header nav ul > li > button")].map((e) => e.textContent.trim()),
    footerCols: document.querySelectorAll("footer nav h2, footer nav h3, footer [data-col], footer nav > div").length,
    footerLinks: document.querySelectorAll("footer a").length,
    homeHeight: document.documentElement.scrollHeight,
    homeSections: [...document.querySelectorAll("main section[id], main [data-chapter]")].map((e) => e.id || e.dataset.chapter),
  }));
  metrics[`home-${vp}`] = m;
  await shot(page, `home-${vp}-full`, { fullPage: true });
  if (vp === "desktop") {
    for (const label of ["Product", "Resources"]) {
      const b = page.locator("header nav button", { hasText: label }).first();
      if (await b.count()) { await page.evaluate(() => window.scrollTo(0, 0)); await b.click(); await settle(page, 600); await shot(page, `nav-${label.toLowerCase()}-open-desktop`); await page.keyboard.press("Escape"); await settle(page, 300); }
    }
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
    const t = page.locator("header button[aria-controls=mobile-menu]");
    if (await t.count()) { await t.click(); await settle(page, 700); await shot(page, `nav-menu-open-phone`); await page.keyboard.press("Escape"); }
  }
  const f = page.locator("footer").first();
  if (await f.count()) { await f.scrollIntoViewIfNeeded(); await settle(page, 800); await f.screenshot({ path: `${out}/footer-${vp}.png` }).catch(() => {}); console.log(`${out}/footer-${vp}.png`); }
  for (const path of ["/features", "/pricing"]) {
    await page.goto(base + path, { waitUntil: "load", timeout: 120_000 });
    await settle(page, 2000);
    await shot(page, `${path.slice(1)}-${vp}-top`);
    metrics[`${path.slice(1)}-${vp}`] = await page.evaluate(() => ({ height: document.documentElement.scrollHeight }));
    await shot(page, `${path.slice(1)}-${vp}-full`, { fullPage: true });
  }
  await ctx.close();
}

// ── app (signed in) ──
if (want("app")) {
  const ctx = await newCtx(1280, 800);
  const page = await ctx.newPage();
  const email = `minimal-${Date.now().toString(36)}@example.com`;
  await page.goto(base + "/signin?next=%2Fapp", { timeout: 120_000 });
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
  await page.waitForURL(/\/(app|welcome)/, { timeout: 60_000 });
  await page.route("**/api/compute", async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    if (j.account && !j.account.name) j.account.name = "Alex Rivera";
    await route.fulfill({ response: res, json: j });
  });
  const skipFirst = async () => { const skip = page.locator("button", { hasText: /^Skip$/ }).first(); if (await skip.isVisible().catch(() => false)) { await skip.click(); await settle(page, 600); } };
  for (const [w, h, vp] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(base + "/app/ask", { waitUntil: "load", timeout: 120_000 });
    await settle(page, 3000);
    await skipFirst();
    if (vp === "phone") { const open = page.locator("button[aria-label*='sidebar' i], button[aria-label*='menu' i]").first(); await shot(page, `app-ask-${vp}`); if (await open.count()) { await open.click(); await settle(page, 700); await shot(page, `app-sidebar-${vp}`); await page.keyboard.press("Escape"); } }
    else {
      await shot(page, `app-ask-${vp}`);
      metrics[`sidebar-${vp}`] = await page.evaluate(() => {
        const nav = document.querySelector("nav[aria-label=Keplar]");
        return nav ? { items: [...nav.querySelectorAll("a, button")].filter((e) => e.offsetParent).map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)) } : null;
      });
      const more = page.locator("[data-more]").first();
      if (await more.count()) { await more.click(); await settle(page, 500); await page.locator("nav[aria-label=Keplar]").screenshot({ path: `${out}/app-sidebar-more-${vp}.png` }).catch(() => {}); console.log(`${out}/app-sidebar-more-${vp}.png`); await more.click().catch(() => {}); }
      const acct = page.locator("[data-account-menu] > button").first();
      if (await acct.count()) { await acct.click(); await settle(page, 600); await shot(page, `app-account-menu-${vp}`); await page.keyboard.press("Escape"); await settle(page, 300); }
      await page.keyboard.press("Control+k"); await settle(page, 600); await shot(page, `app-cmdk-${vp}`); await page.keyboard.press("Escape"); await settle(page, 300);
    }
    for (const p of ["create", "agents", "business", "projects"]) {
      await page.goto(base + `/app/${p}`, { waitUntil: "load", timeout: 120_000 });
      await settle(page, 3000);
      await shot(page, `app-${p}-${vp}`);
      if (p === "business") {
        const more = page.locator("[data-business-more]");
        if (await more.count()) { await more.click(); await settle(page, 600); await shot(page, `app-business-${vp}-more`); await page.keyboard.press("Escape"); }
      }
      if (p === "create") {
        metrics[`create-${vp}`] = await page.evaluate(() => ({ tabs: [...document.querySelectorAll("[role=tab]")].filter((e) => e.offsetParent).map((e) => e.textContent.trim()), height: document.querySelector("main")?.scrollHeight }));
        await shot(page, `app-create-${vp}-full`, { fullPage: true });
        const opt = page.locator("[data-create-options]");
        if (await opt.count()) { await opt.click(); await settle(page, 1500); await shot(page, `app-create-${vp}-options`, { fullPage: true }); }
      }
    }
    await page.goto(base + "/account", { waitUntil: "load", timeout: 120_000 });
    await settle(page, 2500);
    await shot(page, `settings-${vp}`);
    const tabs = page.locator("[role=tablist][aria-label='Settings categories'] [role=tab]");
    const n = await tabs.count();
    metrics[`settings-${vp}`] = { tabs: await tabs.allTextContents() };
    if (vp === "desktop") for (let i = 0; i < n; i++) {
      const t = tabs.nth(i);
      if (!(await t.isVisible())) continue;
      const name = (await t.textContent()).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await t.click(); await settle(page, 700);
      await shot(page, `settings-${String(i + 1).padStart(2, "0")}-${name}-${vp}`, { fullPage: true });
    }
  }
  await ctx.close();
}
fs.writeFileSync(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
