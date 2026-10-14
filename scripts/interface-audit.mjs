#!/usr/bin/env node
// Interface audit: every main Keplar One surface at desktop (1440x900) and phone (390x844), Light and Dark, plus axe-core
// (WCAG 2.0/2.1/2.2 A + AA) on each, horizontal-overflow and small-touch-target checks. Writes PNGs and audit.json.
//   node scripts/interface-audit.mjs <base> <outdir> [only=marketing,auth,app]
// <base> must run with KEPLAR_DEV_TOOLS=1 (magic-link outbox) and a fake model server (scripts/fake-llm.mjs) for answers.
import fs from "node:fs";
import { createRequire } from "node:module";
import * as pw from "playwright";

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const [base = "http://localhost:3199", out = "screenshots/interface/before", onlyArg = ""] = process.argv.slice(2);
const only = onlyArg ? onlyArg.split(",") : null;
const want = (k) => !only || only.includes(k);
fs.mkdirSync(out, { recursive: true });

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const report = {};
const VIEWPORTS = [["desktop", 1440, 900], ["phone", 390, 844]];
const THEMES = ["light", "dark"];
const ip = () => `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const settle = (page, ms = 1500) => page.waitForTimeout(ms);

async function newCtx(vp, w, h, theme, pinTheme = true) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: vp === "phone", hasTouch: vp === "phone",
    colorScheme: theme, extraHTTPHeaders: { "x-forwarded-for": ip() },
  });
  if (pinTheme) await ctx.addInitScript((t) => { try { localStorage.setItem("keplar-theme-v2", t); } catch { /* storage blocked */ } }, theme);
  await ctx.addCookies([{ name: "keplar_consent", value: encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } })), url: base }]);
  return ctx;
}

/** Facts a designer cares about on one screen: axe violations, sideways overflow, undersized targets, elements clipped off-screen. */
async function inspect(page) {
  await page.addScriptTag({ content: AXE }).catch(() => {});
  return page.evaluate(async () => {
    const axe = /** @type {any} */ (window).axe;
    let violations = [];
    if (axe) {
      const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
      violations = r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ") }));
    }
    const vw = document.documentElement.clientWidth;
    const overflowX = document.documentElement.scrollWidth - vw;
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
    const controls = [...document.querySelectorAll("button, a[href], [role=button], [role=tab], [role=menuitem], input:not([type=hidden]), select")].filter(visible);
    // WCAG 2.5.8 (AA): at least 24x24 CSS px, or enough spacing. Inline text links are exempt.
    const small = controls.filter((el) => {
      const r = el.getBoundingClientRect();
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") return false;
      return r.width < 24 || r.height < 24;
    }).map((el) => `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label").slice(0, 30)}]` : ""} "${(el.textContent || "").trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
    const offscreen = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 && r.left < vw; }).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`);
    const unnamed = controls.filter((el) => /^(BUTTON|A)$/.test(el.tagName) && !(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || (el.textContent || "").trim())).length;
    return { violations, overflowX, smallTargets: small.slice(0, 12), smallCount: small.length, offscreen: offscreen.slice(0, 8), unnamed, controls: controls.length };
  });
}

async function capture(page, key, opts = {}) {
  const p = `${out}/${key}.png`;
  await page.screenshot({ path: p, ...opts }).catch((e) => console.log("shot failed", key, e.message));
  if (opts.noInspect) return;
  report[key] = await inspect(page).catch((e) => ({ error: e.message }));
  const r = report[key];
  console.log(`${key}: axe ${r.violations?.length ?? "?"} overflowX ${r.overflowX} small ${r.smallCount} offscreen ${r.offscreen?.length}`);
}

const MARKETING = [["home", "/"], ["pricing", "/pricing"], ["features", "/features"], ["download", "/download"], ["help", "/help"], ["404", "/this-page-does-not-exist"]];
const AUTH = [["signin", "/signin"], ["signup", "/signup"], ["forgot", "/forgot-password"]];

for (const [vp, w, h] of VIEWPORTS) for (const theme of THEMES) {
  const tag = `${vp}-${theme}`;
  if (want("marketing") || want("auth")) {
    const ctx = await newCtx(vp, w, h, theme);
    const page = await ctx.newPage();
    for (const [name, path] of [...(want("marketing") ? MARKETING : []), ...(want("auth") ? AUTH : [])]) {
      await page.goto(base + path, { waitUntil: "load", timeout: 120_000 }).catch(() => {});
      await settle(page, name === "home" ? 3500 : 1800);
      await capture(page, `${name}-${tag}`);
      if (name === "home" && vp === "phone") {
        const t = page.locator("header button[aria-controls=site-menu]");
        if (await t.count()) { await t.click(); await settle(page, 700); await capture(page, `nav-sheet-${tag}`, { noInspect: true }); await page.keyboard.press("Escape"); }
      }
    }
    await ctx.close();
  }
}

// ── app (signed in): one account, both themes, both viewports ──
if (want("app")) {
  const ctx = await newCtx("desktop", 1440, 900, "light", false);
  const page = await ctx.newPage();
  const email = `audit-${Date.now().toString(36)}@example.com`;
  await page.goto(base + "/signin?next=%2Fapp", { timeout: 120_000 });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 2000 }).catch(() => {});
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link|continue with email|send/i }).first().click();
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
  await page.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name: "Alex" } } }).catch(() => {});
  // Optional: put the account on a paid plan in the server's throwaway store (AUDIT_DATA_DIR = the server's KEPLAR_DATA_DIR), so a
  // fake-model answer streams instead of the Free plan's catalog guard.
  if (process.env.AUDIT_DATA_DIR) {
    const { execFileSync } = await import("node:child_process");
    execFileSync("npx", ["tsx", "--tsconfig", "tsconfig.json", "e2e/set-plan.ts", email, process.env.AUDIT_PLAN || "plus"], { env: { ...process.env, KEPLAR_DATA_DIR: process.env.AUDIT_DATA_DIR }, stdio: "inherit" });
  }
  const skip = async () => { for (const re of [/^Skip$/, /^Not now$/, /^Maybe later$/]) { const b = page.getByRole("button", { name: re }).first(); if (await b.isVisible().catch(() => false)) { await b.click(); await settle(page, 500); } } };
  const setTheme = (t) => page.evaluate((t) => { localStorage.setItem("keplar-theme-v2", t); document.cookie = `keplar-theme-v2=${t};path=/`; }, t);

  for (const theme of THEMES) for (const [vp, w, h] of VIEWPORTS) {
    const tag = `${vp}-${theme}`;
    await setTheme(theme);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(base + "/app/ask", { waitUntil: "load", timeout: 120_000 });
    await settle(page, 2500);
    await skip();
    await capture(page, `app-home-${tag}`);
    if (vp === "phone") {
      const open = page.locator("button[aria-label*='sidebar' i], button[aria-label*='menu' i]").first();
      if (await open.count()) { await open.click(); await settle(page, 700); await capture(page, `app-sidebar-${tag}`); await page.keyboard.press("Escape"); await settle(page, 400); }
    }
    // Composer menus
    const attach = page.locator("[data-attach-btn]").first();
    if (await attach.isVisible().catch(() => false)) { await attach.click(); await settle(page, 500); await capture(page, `app-attach-menu-${tag}`, { noInspect: true }); await page.keyboard.press("Escape"); await settle(page, 300); }
    const more = page.locator("button[aria-controls$='-more'][aria-haspopup=menu]").first();
    if (await more.isVisible().catch(() => false)) { await more.click(); await settle(page, 500); await capture(page, `app-modes-menu-${tag}`, { noInspect: true }); await page.keyboard.press("Escape"); await settle(page, 300); }
    // An answer (fake model server)
    if (theme === "light") {
      const box = page.locator("textarea").first();
      if (await box.isVisible().catch(() => false)) {
        await box.fill("What is the boiling point of water at sea level?");
        await box.press("Enter");
        await settle(page, 1200);
        await capture(page, `app-answer-streaming-${tag}`, { noInspect: true });
        await settle(page, 9000);
        await capture(page, `app-answer-${tag}`);
      }
    }
    if (vp === "desktop") {
      const acct = page.locator("[data-account-menu] > button").first();
      if (await acct.count()) { await acct.click(); await settle(page, 600); await capture(page, `app-account-menu-${tag}`, { noInspect: true }); await page.keyboard.press("Escape"); await settle(page, 300); }
      await page.keyboard.press("Control+k"); await settle(page, 600); await capture(page, `app-search-${tag}`, { noInspect: true }); await page.keyboard.press("Escape"); await settle(page, 300);
    }
    for (const p of ["create", "study", "slides", "projects", "history"]) {
      await page.goto(base + `/app/${p}`, { waitUntil: "load", timeout: 120_000 }).catch(() => {});
      await settle(page, 2500);
      await skip();
      await capture(page, `app-${p}-${tag}`);
    }
    await page.goto(base + "/account", { waitUntil: "load", timeout: 120_000 });
    await settle(page, 2500);
    await capture(page, `settings-${tag}`);
  }
  await ctx.close();
}

const prev = fs.existsSync(`${out}/audit.json`) ? JSON.parse(fs.readFileSync(`${out}/audit.json`, "utf8")) : {};
fs.writeFileSync(`${out}/audit.json`, JSON.stringify({ ...prev, ...report }, null, 2));
await browser.close();
