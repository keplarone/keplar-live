// Live check of the desktop sign-in through the system browser, against a running server (scripts/e2e-server.sh):
//   DESKTOP_DIST=/path/to/keplar-desktop/dist/main node scripts/desktop-auth-e2e.mjs http://localhost:3470
// It runs the desktop app's real SignInFlow (dist/main/desktop-auth.js) against the real endpoints and drives the browser page
// with Playwright. Four cases: deep link, polling fallback (keplar:// not delivered), cancel, and Add account (a second account
// finishes inside a window that is already signed in).
import { chromium } from "playwright";
import { createRequire } from "node:module";

const base = process.argv[2] || "http://localhost:3470";
const dist = process.env.DESKTOP_DIST || "/tmp/kd/dist/main";
const { SignInFlow } = createRequire(import.meta.url)(`${dist}/desktop-auth.js`);
const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let bad = 0;
const ok = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error("timed out"); await sleep(50); } };
const hdr = () => ({ "content-type": "application/json", origin: base, "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

async function signIn(ctx, email, name) {
  const r1 = await ctx.request.post(base + "/api/auth/sign-in/magic-link", { headers: hdr(), data: { email, callbackURL: "/app" } });
  if (!r1.ok()) throw new Error("magic link " + r1.status());
  const html = await (await ctx.request.get(base + "/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  const r2 = await ctx.request.post(base + "/api/auth/magic-link/confirm", { headers: hdr(), data: { token: new URL(link).searchParams.get("token") } });
  if (!r2.ok()) throw new Error("confirm " + r2.status());
  await ctx.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name } } });
}

/** The app side: a SignInFlow that records what it does. `browser` runs when the system browser "opens" the connect page. */
function app(browser, { pollMs = 150 } = {}) {
  const log = { opened: [], finished: [], states: [] };
  const flow = new SignInFlow({
    fetch, origin: base, label: "Keplar One on Windows (test)", pollMs,
    openExternal: async (url) => { log.opened.push(url); void sleep(150).then(() => browser(url)).catch((e) => { log.error = e; }); },
    loadFinish: (url) => log.finished.push(url),
    onState: (s) => log.states.push(s.phase),
  });
  return { flow, log };
}

/** The browser side: signed in as `email`, shows the connect page, checks the code, presses Connect. Returns the keplar:// link. */
async function connectInBrowser(url, email, expectCode, { press = true } = {}) {
  const ctx = await b.newContext();
  try {
    await signIn(ctx, email, "Browser User");
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: "load" });
    await p.waitForSelector('[data-testid="desktop-connect-code"]', { timeout: 20000 });
    const shown = (await p.textContent('[data-testid="desktop-connect-code"]')).trim();
    ok(shown === expectCode, `the browser page shows the same code as the app (app ${expectCode}, page ${shown})`);
    if (!press) return null;
    await p.click('[data-testid="desktop-connect-approve"]');
    await p.waitForSelector('[data-testid="desktop-connect-opened"]', { timeout: 20000 });
    return await p.getAttribute('[data-testid="desktop-connect-opened"] a', "href");
  } finally {
    await ctx.close();
  }
}

async function finishInAppWindow(appCtx, finishUrl) {
  const p = await appCtx.newPage();
  await p.goto(finishUrl, { waitUntil: "load" });
  const session = await (await appCtx.request.get(base + "/api/auth/get-session")).json();
  const url = p.url();
  await p.close();
  return { email: session?.user?.email, url };
}

const stamp = Date.now() % 1e6;

try {
  // 1. deep link
  {
    let link = null; let flowRef;
    const { flow, log } = app(async (url) => { link = await connectInBrowser(url, `dl${stamp}@example.com`, flowRef.current.code); await flowRef.flow.handleDeepLink(link); });
    flowRef = { flow, get current() { return flow.current; } };
    await flow.begin("signin");
    ok(flow.current.phase === "waiting" && /^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(flow.current.code), `app is waiting with a code (${flow.current.code})`);
    await until(() => log.finished.length === 1);
    ok(/\/api\/auth\/desktop\/finish\?ticket=/.test(log.finished[0]), "deep link: the app got a finish ticket");
    const appCtx = await b.newContext();
    const r = await finishInAppWindow(appCtx, log.finished[0]);
    ok(r.email === `dl${stamp}@example.com`, `deep link: the app window is signed in as the browser account (${r.email})`);
    ok(/\/(app|welcome)/.test(r.url), `deep link: lands in the app (${new URL(r.url).pathname})`);
    const fresh = await b.newContext();
    const again = await fresh.newPage();
    await again.goto(log.finished[0], { waitUntil: "load" });
    ok(/desktop_link_used/.test(again.url()), `deep link: the ticket cannot be used twice (${again.url()})`);
    await fresh.close();
    ok(log.states.at(-1) === "done", "deep link: states ended in done");
    await appCtx.close();
  }
  // 2. polling fallback: the keplar:// link is never delivered
  {
    let flowRef;
    const { flow, log } = app(async (url) => { await connectInBrowser(url, `poll${stamp}@example.com`, flowRef.current.code); });
    flowRef = { get current() { return flow.current; } };
    await flow.begin("signin");
    await until(() => log.finished.length === 1);
    const appCtx = await b.newContext();
    const r = await finishInAppWindow(appCtx, log.finished[0]);
    ok(r.email === `poll${stamp}@example.com`, `polling: signed in without any keplar:// link (${r.email})`);
    await appCtx.close();
  }
  // 3. cancel while waiting: the browser page stops working
  {
    const { flow, log } = app(async () => undefined);
    await flow.begin("signin");
    const rid = new URL(log.opened[0]).searchParams.get("rid");
    flow.cancel();
    await sleep(400);
    ok(flow.current.phase === "idle", "cancel: app is idle");
    const ctx = await b.newContext();
    await signIn(ctx, `cancel${stamp}@example.com`, "Cancel User");
    const res = await ctx.request.post(base + "/api/auth/desktop/approve", { headers: hdr(), data: { rid } });
    ok(res.status() === 400, `cancel: the browser can no longer approve it (${res.status()})`);
    await ctx.close();
  }
  // 4. Add account: the app window is already signed in as A; browser signs in as B; finish keeps A as a stashed account
  {
    const appCtx = await b.newContext();
    await signIn(appCtx, `adda${stamp}@example.com`, "Account A");
    let flowRef;
    const { flow, log } = app(async (url) => { const link = await connectInBrowser(url, `addb${stamp}@example.com`, flowRef.current.code); await flowRef.flow.handleDeepLink(link); });
    flowRef = { flow, get current() { return flow.current; } };
    await flow.begin("add");
    await until(() => log.finished.length === 1);
    const r = await finishInAppWindow(appCtx, log.finished[0]);
    ok(r.email === `addb${stamp}@example.com`, `add account: the window is now signed in as the new account (${r.email})`);
    const cookies = (await appCtx.cookies()).map((c) => c.name);
    ok(cookies.some((n) => /keplar_acct_/.test(n)), `add account: the first account is kept for switching (${cookies.filter((n) => /acct/.test(n)).join(",")})`);
    await appCtx.close();
  }
} catch (e) {
  ok(false, "unexpected: " + (e?.stack || e));
}
await b.close();
console.log(bad ? `\n${bad} FAILED` : "\nall ok");
process.exit(bad ? 1 : 0);
