// Real-browser test of first-run onboarding on a production build.
//   node scripts/e2e-neon.mjs 5565 &
//   NODE_OPTIONS="--import $PWD/scripts/e2e-neon-preload.mjs" DATABASE_URL=postgres://u:p@ep-fake-123.us-east-2.aws.neon.tech/db \
//     BETTER_AUTH_SECRET=<32+ chars> BETTER_AUTH_URL=http://localhost:3117 KEPLAR_DEV_TOOLS=1 npx next start -p 3117 > /tmp/ob-server.log 2>&1 &
//   SERVER_LOG=/tmp/ob-server.log node scripts/onboarding-e2e.mjs http://localhost:3117
// Mail goes to the dev outbox (logged as "[outbox]"), so no real email is sent. Exit 1 on any failure.
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3117";
const LOG = process.env.SERVER_LOG || "/tmp/ob-server.log";
const NEON = `http://127.0.0.1:${process.env.E2E_NEON_PORT || 5565}/sql`;
const SHOTS = process.env.SHOTS || "/tmp/ob-shots";
fs.mkdirSync(SHOTS, { recursive: true });
const exe = process.env.CHROME || "/usr/bin/google-chrome";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

let bad = 0;
const ok = (c, m, extra = "") => { console.log(c ? "PASS" : "FAIL", m, extra); if (!c) bad++; };
const stamp = Date.now();
let seq = 0;
const sql = async (query, params = []) => { const j = await (await fetch(NEON, { method: "POST", body: JSON.stringify({ query, params }) })).json(); if (j.message) throw new Error("sql: " + j.message); return j.rows; };
const rowFor = async (email) => (await sql("SELECT * FROM keplar_users WHERE lower(email)=lower($1)", [email]))[0];
const log = () => fs.readFileSync(LOG, "utf8");
const linkFor = (email) => { const t = log(); const i = t.lastIndexOf(email); if (i < 0) return null; const m = /http:\/\/localhost:\d+\/signin\/verify\?token=\S+/.exec(t.slice(i)); return m ? m[0] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}

/** Sign in (creating the account) through the real magic-link email + confirm page. */
async function signIn({ ctx, page }, { email, name = "Ada Lovelace", next = "/app" }) {
  const ip = `10.${stamp % 250}.${(seq >> 8) & 255}.${(++seq) & 255}`;
  const r = await ctx.request.post(`${BASE}/api/auth/sign-in/magic-link`, { headers: { origin: BASE, "x-forwarded-for": ip }, data: { email, name, callbackURL: next } });
  if (!r.ok()) throw new Error("magic link request failed " + r.status() + " " + (await r.text()));
  let link = null;
  for (let i = 0; i < 40 && !link; i++) { await sleep(150); link = linkFor(email); }
  await page.goto(link);
  await page.click('button:has-text("Sign in")');
}
const fresh = () => `ob${stamp}x${++seq}@gmail.com`;
const heading = (p) => p.locator("#ob-h");
const onStep = async (p, n) => p.locator("p", { hasText: new RegExp(`^Step ${n} of 5$`) }).waitFor({ timeout: 8000 });
const fieldEvents = (p) => p.evaluate(() => window.__fe || []);
const initSpy = (p) => p.addInitScript(() => { window.__fe = []; window.addEventListener("keplar:field", (e) => window.__fe.push(e.detail)); });

// ---------------------------------------------------------------- 0. signed out
{
  const { ctx, page } = await newCtx();
  const r = await ctx.request.get(`${BASE}/api/onboarding`);
  ok(r.status() === 401, "GET /api/onboarding signed out -> 401", String(r.status()));
  const w = await page.goto(`${BASE}/welcome?next=/pricing`);
  ok(/\/signin\?next=/.test(page.url()), "/welcome signed out -> /signin?next=", page.url());
  const wr = await ctx.request.post(`${BASE}/api/onboarding`, { headers: { origin: "https://evil.example" }, data: { action: "skip" } });
  ok([401, 403].includes(wr.status()), "POST /api/onboarding from another origin rejected", String(wr.status()));
  await ctx.close();
}

// ---------------------------------------------------------------- 1. full new-account flow (desktop)
{
  const email = fresh();
  const c = await newCtx();
  const { page, errors } = c;
  await initSpy(page);
  await signIn(c, { email });
  await page.waitForURL(/\/welcome/, { timeout: 15000 });
  ok(true, "new account lands on /welcome after magic-link sign-in", page.url());
  await onStep(page, 1);
  ok((await heading(page).innerText()).startsWith("Welcome, Ada"), "step 1 greets by first name", await heading(page).innerText());
  ok((await page.evaluate(() => document.activeElement?.id)) === "ob-h" || (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "ob-start", "focus is on the start button / heading");
  await page.waitForSelector("canvas.pagefield", { state: "attached" });
  await page.waitForTimeout(2500);
  ok(await page.evaluate(() => document.documentElement.getAttribute("data-field") !== null), "particle field is active on /welcome", await page.evaluate(() => document.documentElement.getAttribute("data-field")));
  await page.screenshot({ path: `${SHOTS}/d1-welcome.png` });
  await page.click('[data-testid="ob-start"]');
  await onStep(page, 2);
  ok(true, "Set up Keplar -> step 2");
  ok((await heading(page).innerText()).includes("What will you use Keplar for?"), "step 2 heading");
  const before = (await fieldEvents(page)).filter((e) => e.phase === "boom").length;
  const chips = page.locator("button[aria-pressed]");
  ok((await chips.count()) >= 6, "step 2 has use chips", String(await chips.count()));
  await chips.nth(0).click();
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${SHOTS}/d2a-boom-early.png` });
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${SHOTS}/d2b-boom-mid.png` });
  await chips.nth(2).click();
  await page.waitForTimeout(900);
  const evs = await fieldEvents(page);
  ok(evs.filter((e) => e.phase === "boom").length >= before + 2, "choosing an option fires a boom event for the field");
  ok((await chips.nth(0).getAttribute("aria-pressed")) === "true", "chip aria-pressed=true");
  await page.fill("#ob-role", "founder");
  await page.screenshot({ path: `${SHOTS}/d2-purpose.png` });
  await page.click('[data-testid="ob-next"]');
  const t0 = Date.now();
  await page.getByText("Personalizing your experience…").waitFor({ timeout: 3000 });
  ok(true, "'Personalizing your experience…' state shown");
  ok((await fieldEvents(page)).some((e) => e.phase === "personalize" && e.on === true), "field gets personalize=true");
  ok((await fieldEvents(page)).some((e) => e.phase === "scene" && Array.isArray(e.picks) && e.picks.length === 2), "field is told the picks (it reorganizes around them)");
  await page.screenshot({ path: `${SHOTS}/d3-personalizing.png` });
  await onStep(page, 3);
  const dt = Date.now() - t0;
  ok(dt > 500 && dt < 2600, "personalizing lasts about a second", `${dt}ms`);
  // typing check on the name field
  ok((await page.inputValue("#ob-name")).startsWith("Ada"), "name field prefilled from the account", await page.inputValue("#ob-name"));
  await page.click("#ob-name"); await page.fill("#ob-name", "");
  await page.evaluate(() => {
    window.__ev = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ev.push([e.name, Math.round(e.processingEnd - e.startTime)]); }).observe({ type: "event", durationThreshold: 16, buffered: true });
    window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true }); } catch {}
  });
  await page.keyboard.type("Augusta Ada Byron King", { delay: 25 });
  await page.waitForTimeout(300);
  const worst = await page.evaluate(() => Math.max(0, ...window.__ev.filter((x) => /key|input/.test(x[0])).map((x) => x[1])));
  const lt = await page.evaluate(() => window.__lt.length);
  ok(worst <= 16, "typing latency: input delay + handler time (start to processingEnd) <= one frame (16ms) with the field running", `${worst}ms, long tasks ${lt}`);
  // theme + switches
  await page.locator('label:has-text("Light")').first().click();
  ok((await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light", "choosing Light applies the theme right away");
  await page.locator('label:has-text("Dark")').first().click();
  const ins = page.locator("#ob-insert, [aria-labelledby='ob-insert-l']").first();
  ok((await ins.getAttribute("aria-checked")) === "true", "Insert key switch defaults on");
  await ins.click();
  ok((await page.evaluate(() => localStorage.getItem("kp-insert-key"))) === "0", "turning Insert key off is stored");
  await ins.click();
  const mem = page.locator("[aria-labelledby='ob-memory-l']").first();
  await mem.click();
  await page.screenshot({ path: `${SHOTS}/d4-prefs.png` });
  await page.click('[data-testid="ob-next"]');
  await onStep(page, 4);
  const stepTxt = await page.locator("main, body").first().innerText();
  ok(/Not available on your plan|paid plan/i.test(stepTxt), "connect step is honest about the Free plan");
  ok(await page.locator('a[href*="download"], a:has-text("Download")').count() > 0, "desktop app link present");
  await page.screenshot({ path: `${SHOTS}/d5-connect.png` });
  await page.click('[data-testid="ob-next"]');
  await onStep(page, 5);
  ok(/free models only/i.test(await page.locator("body").innerText()), "final step states the Free plan honestly");
  await page.screenshot({ path: `${SHOTS}/d6-ready.png` });
  await page.click('[data-testid="ob-finish"]');
  await page.waitForURL(/\/app(\?|$|#)/, { timeout: 15000 });
  ok(true, "finishing lands in /app", page.url());
  await page.getByTestId("app-onboarding").waitFor({ timeout: 15000 });
  ok(/try your first question/i.test(await page.getByTestId("app-onboarding").innerText()), "guided first-question card shown");
  ok((await page.locator('ul[aria-label="Suggested first questions"] button').count()) >= 3, "3-4 personalized starters", String(await page.locator('ul[aria-label="Suggested first questions"] button').count()));
  ok(/0 of 4/.test(await page.getByTestId("app-onboarding").innerText()), "checklist starts at 0 of 4 (real progress)");
  await page.screenshot({ path: `${SHOTS}/d7-app.png` });
  const row = await rowFor(email);
  ok(!!row.onboarding_completed_at, "DB: completed_at set");
  const ans = JSON.parse(row.onboarding_answers || "{}");
  ok(Array.isArray(ans.uses) && ans.uses.length === 2 && ans.role === "founder" && ans.name === "Augusta Ada Byron King" && ans.memory === false && ans.theme === "dark", "DB: answers stored", row.onboarding_answers);
  // real progress: click the Create item
  const createItem = page.locator('[data-testid="app-onboarding"] li', { hasText: /Create/i }).locator("a,button").first();
  if (await createItem.count()) { await createItem.click(); await sleep(800); }
  await page.goto(`${BASE}/app`);
  await page.getByTestId("app-onboarding").waitFor({ timeout: 15000 }).catch(() => {});
  const prog = JSON.parse((await rowFor(email)).onboarding_progress || "{}");
  ok(!!prog.triedCreate, "checklist progress persisted (triedCreate)", JSON.stringify(prog));
  // revisiting /welcome after completion goes to the app
  await page.goto(`${BASE}/welcome`);
  await page.waitForURL(/\/app/, { timeout: 10000 });
  ok(true, "completed account visiting /welcome is sent to /app");
  // replay from settings
  await page.goto(`${BASE}/account`);
  await page.getByRole("button", { name: "Replay onboarding" }).click();
  await page.waitForURL(/\/welcome/, { timeout: 10000 });
  await onStep(page, 1);
  ok(true, "Settings > Replay onboarding reopens the flow");
  ok(errors.length === 0, "no console/page errors in the full flow", errors.slice(0, 3).join(" | "));
  await c.ctx.close();
}

// ---------------------------------------------------------------- 2. skip + ?next
{
  const email = fresh();
  const c = await newCtx();
  await signIn(c, { email, next: "/pricing" });
  await c.page.waitForURL(/\/welcome\?next=%2Fpricing|\/welcome\?next=\/pricing/, { timeout: 15000 });
  ok(true, "?next preserved through /welcome", c.page.url());
  await onStep(c.page, 1);
  await c.page.click('button:has-text("Skip setup")');
  await c.page.waitForURL(/\/pricing/, { timeout: 15000 });
  ok(true, "Skip setup goes to ?next (/pricing)");
  const row = await rowFor(email);
  ok(!!row.onboarding_skipped_at, "DB: skipped_at set");
  await c.page.goto(`${BASE}/app`);
  await c.page.waitForTimeout(2500);
  ok(/\/app/.test(c.page.url()) && !/welcome/.test(c.page.url()), "skipped user is never pushed back into onboarding");
  await c.ctx.close();
}

// ---------------------------------------------------------------- 3. resume after refresh
{
  const email = fresh();
  const c = await newCtx();
  await signIn(c, { email });
  await c.page.waitForURL(/\/welcome/, { timeout: 15000 });
  await c.page.click('[data-testid="ob-start"]');
  await onStep(c.page, 2);
  await c.page.locator("button[aria-pressed]").nth(1).click();
  await c.page.click('[data-testid="ob-next"]');
  await onStep(c.page, 3);
  await c.page.reload();
  await onStep(c.page, 3);
  ok(true, "refresh resumes at step 3");
  await c.page.click('button:has-text("Back")');
  await onStep(c.page, 2);
  ok((await c.page.locator("button[aria-pressed]").nth(1).getAttribute("aria-pressed")) === "true", "saved purpose choice restored after refresh");
  // leaving the tab mid-flow and opening /app shows the finish-setup card, not a trap
  await c.page.goto(`${BASE}/app`);
  await c.page.waitForTimeout(3000);
  ok((await c.page.locator("body").innerText()).length > 50, "/app is reachable mid-onboarding (never blocked)", c.page.url());
  await c.ctx.close();
}

// ---------------------------------------------------------------- 4. existing (legacy) account: not forced, tour offered
{
  const email = fresh();
  const c = await newCtx();
  await signIn(c, { email });
  await c.page.waitForURL(/\/welcome/, { timeout: 15000 });
  await onStep(c.page, 1);
  await sleep(1500); // let the page's own start-up writes land first
  await sql("UPDATE keplar_users SET onboarding_required=false, onboarding_completed_at=NULL, onboarding_skipped_at=NULL, onboarding_step=0, onboarding_started_at=NULL WHERE lower(email)=lower($1)", [email]);
  await c.page.goto(`${BASE}/app`);
  await c.page.waitForTimeout(3500);
  ok(!/welcome/.test(c.page.url()), "existing account is not forced into onboarding", c.page.url());
  const tour = c.page.getByRole("button", { name: "Take the one-minute tour" });
  await tour.waitFor({ timeout: 10000 });
  ok(true, "existing account sees a gentle 'Take the tour' entry");
  await tour.click();
  await c.page.waitForURL(/\/welcome/, { timeout: 10000 });
  ok(true, "Take the tour opens the flow");
  await c.ctx.close();
}

// ---------------------------------------------------------------- 5. mobile 390px
{
  const email = fresh();
  const c = await newCtx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { page, errors } = c;
  await signIn(c, { email });
  await page.waitForURL(/\/welcome/, { timeout: 15000 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const reachable = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return !!b && b.x >= 0 && b.x + b.width <= 391 && b.height >= 40; };
  await onStep(page, 1);
  ok((await overflow()) <= 0, "390px step 1: no horizontal overflow");
  ok(await reachable('[data-testid="ob-start"]'), "390px: primary button inside viewport and >= 40px tall");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/m1-welcome.png` });
  await page.tap('[data-testid="ob-start"]');
  await onStep(page, 2);
  await page.locator("button[aria-pressed]").nth(0).tap();
  await page.locator("button[aria-pressed]").nth(3).tap();
  ok((await overflow()) <= 0, "390px step 2: no horizontal overflow");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/m2-purpose.png` });
  await page.locator('[data-testid="ob-next"]').scrollIntoViewIfNeeded();
  ok(await reachable('[data-testid="ob-next"]'), "390px step 2: Continue reachable");
  await page.tap('[data-testid="ob-next"]');
  await page.getByText("Personalizing your experience…").waitFor({ timeout: 3000 });
  await page.screenshot({ path: `${SHOTS}/m3-personalizing.png` });
  await onStep(page, 3);
  ok((await overflow()) <= 0, "390px step 3: no horizontal overflow");
  await page.screenshot({ path: `${SHOTS}/m4-prefs.png`, fullPage: true });
  await page.locator('[data-testid="ob-next"]').scrollIntoViewIfNeeded();
  await page.tap('[data-testid="ob-next"]');
  await onStep(page, 4);
  ok((await overflow()) <= 0, "390px step 4: no horizontal overflow");
  await page.screenshot({ path: `${SHOTS}/m5-connect.png`, fullPage: true });
  await page.locator('[data-testid="ob-next"]').scrollIntoViewIfNeeded();
  await page.tap('[data-testid="ob-next"]');
  await onStep(page, 5);
  await page.tap('[data-testid="ob-finish"]');
  await page.waitForURL(/\/app/, { timeout: 15000 });
  await page.getByTestId("app-onboarding").waitFor({ timeout: 15000 });
  ok((await overflow()) <= 0, "390px /app guided card: no horizontal overflow");
  await page.screenshot({ path: `${SHOTS}/m6-app.png` });
  ok(errors.length === 0, "390px: no console/page errors", errors.slice(0, 3).join(" | "));
  await c.ctx.close();
}

// ---------------------------------------------------------------- 6. keyboard only
{
  const email = fresh();
  const c = await newCtx();
  const { page } = c;
  await signIn(c, { email });
  await page.waitForURL(/\/welcome/, { timeout: 15000 });
  await onStep(page, 1);
  const tabTo = async (pred, max = 40) => { for (let i = 0; i < max; i++) { if (await page.evaluate(pred)) return true; await page.keyboard.press("Tab"); } return false; };
  await page.keyboard.press("Enter"); // autofocused "Set up Keplar"
  await onStep(page, 2);
  ok((await page.evaluate(() => document.activeElement?.id)) === "ob-h", "focus moves to the step heading on each step");
  ok(await tabTo(() => document.activeElement?.getAttribute("aria-pressed") !== null), "Tab reaches the first choice chip");
  await page.keyboard.press("Space");
  ok((await page.evaluate(() => document.activeElement?.getAttribute("aria-pressed"))) === "true", "Space toggles a chip");
  ok(await tabTo(() => document.activeElement?.getAttribute("data-testid") === "ob-next"), "Tab reaches Continue");
  await page.keyboard.press("Enter");
  await onStep(page, 3);
  ok(await tabTo(() => document.activeElement?.id === "ob-name"), "Tab reaches the name field");
  ok(await tabTo(() => document.activeElement?.getAttribute("role") === "switch"), "Tab reaches the switches (via the theme radios)");
  await page.keyboard.press("Space");
  ok(await tabTo(() => document.activeElement?.getAttribute("data-testid") === "ob-next"), "Tab reaches Continue (step 3)");
  await page.keyboard.press("Enter");
  await onStep(page, 4);
  ok(await tabTo(() => document.activeElement?.getAttribute("data-testid") === "ob-next"), "Tab reaches Continue (step 4)");
  await page.keyboard.press("Enter");
  await onStep(page, 5);
  ok(await tabTo(() => document.activeElement?.getAttribute("data-testid") === "ob-finish"), "Tab reaches the final Open Keplar button");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app/, { timeout: 15000 });
  ok(true, "finished with the keyboard only");
  await c.ctx.close();
}

// ---------------------------------------------------------------- 7. reduced motion
{
  const email = fresh();
  const c = await newCtx({ reducedMotion: "reduce" });
  const { page, errors } = c;
  await initSpy(page);
  await signIn(c, { email });
  await page.waitForURL(/\/welcome/, { timeout: 15000 });
  await onStep(page, 1);
  await page.waitForSelector("canvas.pagefield", { state: "attached" });
  await page.waitForTimeout(2000);
  ok(await page.evaluate(() => document.documentElement.getAttribute("data-field") !== null), "reduced motion: the field is still on");
  await page.click('[data-testid="ob-start"]');
  await onStep(page, 2);
  await page.locator("button[aria-pressed]").nth(0).click();
  const evs = await fieldEvents(page);
  ok(evs.some((e) => e.phase === "boom"), "reduced motion: boom event still sent (engine renders a quick fade instead of the burst)");
  await page.click('[data-testid="ob-next"]');
  const t0 = Date.now();
  await onStep(page, 3);
  const dt = Date.now() - t0;
  ok(dt < 1200, "reduced motion: Personalizing pause is short", `${dt}ms`);
  ok(errors.length === 0, "reduced motion: no console errors", errors.slice(0, 3).join(" | "));
  await page.screenshot({ path: `${SHOTS}/r1-reduced.png` });
  await c.ctx.close();
}

// ---------------------------------------------------------------- 8. WebGL context loss (main-thread renderer so the test can reach the context)
{
  const email = fresh();
  const c = await newCtx();
  const { page, errors } = c;
  await signIn(c, { email });
  await page.waitForURL(/\/welcome/, { timeout: 15000 });
  await page.goto(`${BASE}/welcome?fworker=0`);
  await onStep(page, 1);
  await page.waitForSelector("canvas.pagefield", { state: "attached" });
  await page.waitForTimeout(2500);
  const lost = await page.evaluate(() => {
    const cv = document.querySelector("canvas.pagefield");
    const gl = cv && (cv.getContext("webgl2") || cv.getContext("webgl"));
    const ext = gl && gl.getExtension("WEBGL_lose_context");
    if (!ext) return "noext";
    window.__ctxlost = 0; cv.addEventListener("webglcontextlost", () => window.__ctxlost++);
    ext.loseContext();
    return "lost";
  });
  ok(lost === "lost", "main-thread renderer exposes a context to lose", lost);
  await page.waitForTimeout(4000);
  const alive = await page.evaluate(() => {
    const cv = document.querySelector("canvas.pagefield");
    return { has: !!cv, field: document.documentElement.getAttribute("data-field") };
  });
  ok(alive.has && alive.field !== null, "field recovers after WebGL context loss", JSON.stringify(alive));
  await page.click('[data-testid="ob-start"]');
  await onStep(page, 2);
  ok(true, "UI stays usable after context loss");
  ok(errors.length === 0, "no uncaught errors around context loss", errors.slice(0, 3).join(" | "));
  await page.screenshot({ path: `${SHOTS}/w1-after-loss.png` });
  await c.ctx.close();
}

// ---------------------------------------------------------------- 9. booms are randomized and layered, never a reset (main-thread renderer so counters are readable)
for (const reduced of [false, true]) {
  const email = fresh();
  const c = await newCtx(reduced ? { reducedMotion: "reduce" } : {});
  const { page, errors } = c;
  await signIn(c, { email });
  await page.waitForURL(/\/welcome/, { timeout: 15000 });
  await page.goto(`${BASE}/welcome?fworker=0&fxdebug=1`);
  await onStep(page, 1);
  await page.waitForFunction(() => window.__keplarField && window.__keplarField.diag().n > 0, null, { timeout: 15000 });
  await page.waitForTimeout(2500); // the assemble-on-load finishes before we measure
  await page.click('[data-testid="ob-start"]');
  await onStep(page, 2);
  // let the step's own camera move and scene morph finish, so what we measure is the boom and nothing else
  await page.waitForFunction(() => {
    const d = window.__keplarField.diag(); const now = performance.now(); const p = window.__settle;
    window.__settle = { t: now, cam: d.cam };
    return !d.morphing && p && now - p.t > 700 && Math.max(...d.cam.map((v, k) => Math.abs(v - p.cam[k]))) < 0.03;
  }, null, { timeout: 20000, polling: 800 });
  await page.evaluate(() => {
    window.__samples = [];
    const tick = () => { const d = window.__keplarField.diag(); window.__samples.push({ time: d.time, buildT: d.buildT, fills: d.fills, cam: d.cam, morphing: d.morphing, active: d.booms.filter(Boolean).length }); window.__raf = requestAnimationFrame(tick); };
    tick();
  });
  const base = await page.evaluate(() => window.__keplarField.diag());
  const chips = page.locator("button[aria-pressed]");
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await chips.nth(i % 7).click();
    seen.push(await page.evaluate(() => { const b = window.__keplarField.diag().booms.filter(Boolean).sort((a, z) => a.t - z.t)[0]; return b ? b.variant : -1; }));
    await page.waitForTimeout(i % 4 === 3 ? 60 : 320 + ((i * 97) % 200)); // some quick double-clicks (overlap), some spaced
    if (i === 3 || i === 7) await page.screenshot({ path: `${SHOTS}/b${reduced ? "r" : "m"}-${i}.png` });
  }
  await page.waitForTimeout(500);
  const out = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return { samples: window.__samples, end: window.__keplarField.diag() }; });
  const tag = reduced ? "reduced motion: " : "";
  const sm = out.samples;
  const dts = sm.slice(1).map((x, i) => x.time - sm[i].time);
  const camStep = Math.max(...sm.slice(1).map((x, i) => Math.max(...x.cam.map((v, k) => Math.abs(v - sm[i].cam[k])))));
  ok(sm.length > 20, `${tag}sampled ${sm.length} frames while clicking`);
  ok(out.end.fills === base.fills, `${tag}no scene rebuild/re-seed on select (fills ${base.fills} -> ${out.end.fills})`);
  ok(Math.min(...dts) >= 0 && Math.max(...dts) < 0.2, `${tag}motion clock only moves forward, no jump (max step ${Math.max(...dts).toFixed(3)}s)`);
  ok(sm.every((x, i) => i === 0 || x.buildT >= sm[i - 1].buildT), `${tag}assemble-on-load is never restarted (buildT only grows)`);
  ok(camStep < 0.12, `${tag}no camera jump (largest per-frame move ${camStep.toFixed(3)})`);
  ok(sm.some((x) => x.active >= 2), `${tag}quick clicks overlap instead of cutting each other off`);
  ok(seen.every((v) => v >= 0), `${tag}every click started a boom`);
  if (!reduced) {
    ok(seen.slice(1).every((v, i) => v !== seen[i]), `${tag}never the same effect twice in a row`, seen.join(","));
    ok(new Set(seen).size >= 6, `${tag}variety across 12 clicks`, `${new Set(seen).size} distinct: ${seen.join(",")}`);
  }
  ok(await page.evaluate(() => !!document.querySelector("canvas.pagefield")), `${tag}the same canvas is still there`);
  ok(errors.length === 0, `${tag}no console errors during booms`, errors.slice(0, 2).join(" | "));
  await c.ctx.close();
}

await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nall onboarding e2e checks passed");
process.exit(bad ? 1 : 0);
