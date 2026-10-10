import { test, expect, type Page, type BrowserContext } from "playwright/test";
import { execFileSync } from "node:child_process";
import { DATA_DIR, SECRET } from "./playwright.config";

const run = (script: string, ...args: string[]) =>
  execFileSync("node", ["--import", "tsx", `e2e/${script}`, ...args], { cwd: process.cwd(), env: { ...process.env, KEPLAR_DATA_DIR: DATA_DIR, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3199" }, encoding: "utf8" }).trim();

const stamp = Date.now().toString(36);
const ADA = `ada.${stamp}@example.com`;
const BOB = `bob.${stamp}@example.com`;
const CY = `cy.${stamp}@example.com`; // fresh addresses for the later steps: a sign-in link is rate limited per address
const DEE = `dee.${stamp}@example.com`;

const usedLinks = new Set<string>();
let hop = 0;
/** Sign in through the real sign-in page with an emailed link (the dev outbox shows the email). */
async function signInWithLink(page: Page, email: string) {
  // every sign-in link request is rate limited per network address, and all these browsers share one: pose as a new address each time
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.77.${(Date.now() >> 4) & 255}.${++hop}` });
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href: string | null = null;
  await expect(async () => { // the email is written a moment after the click; newest first, so the first link is the one just requested
    await page.goto("/dev/outbox");
    const all = await page.locator("a[href*='/signin/verify']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    href = all.find((h) => !usedLinks.has(h)) ?? null; // newest first; skip links already used by an earlier sign-in
    expect(href).toBeTruthy();
  }).toPass({ timeout: 30_000 });
  usedLinks.add(href!);
  await page.goto(href!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(app|welcome)/, { timeout: 30_000 });
}

const accounts = async (ctx: BrowserContext) => (await (await ctx.request.get("/api/account/accounts")).json()) as { active: { email: string } | null; accounts: { slot: number; email: string; expired: boolean }[] };
const compute = async (ctx: BrowserContext) => (await (await ctx.request.get("/api/compute")).json()) as { plan: string; account: { email: string } | null; daily: { left: number; limit: number } | null };
const seedChat = async (ctx: BrowserContext, id: string, title: string) => {
  const r = await ctx.request.put(`/api/chats/${id}`, { data: { title, messages: [{ role: "user", text: `hello from ${title}` }] } });
  expect(r.status()).toBe(200);
};
async function openMenu(page: Page) {
  await page.locator("[data-account-menu] button").first().click();
  await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
}
// Recents is open by default but can be folded (see recents.e2e.ts): make sure it is open, then expect the chat title.
async function seen(page: Page, title: string) {
  const toggle = page.locator("[data-recents-toggle]").first();
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await expect(page.getByText(title).first()).toBeVisible();
}
async function toApp(page: Page) {
  await page.goto("/app");
  await page.waitForSelector("[data-account-menu]", { timeout: 30_000 });
}

test.describe.serial("two real accounts on one device", () => {
  let ctx: BrowserContext;
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
  });
  test.afterAll(async () => { await ctx.close(); });

  test("sign in as Ada and give her a Plus plan and a chat", async () => {
    await page.goto("/signin?next=%2Fapp");
    await signInWithLink(page, ADA);
    expect((await compute(ctx)).account?.email).toBe(ADA);
    run("set-plan.ts", ADA, "plus");
    await seedChat(ctx, "thr_e2e_ada", "Ada's roadmap");
    await toApp(page);
    await seen(page, "Ada's roadmap");
    expect((await compute(ctx)).plan).toBe("plus");
  });

  test("Add account: sign in as Bob from the menu, both stay signed in, Bob is active on a Free plan with his own chats", async () => {
    await openMenu(page);
    await page.locator("[data-account-action=add]").click();
    await page.waitForURL(/\/signin\?.*add=1/);
    await signInWithLink(page, BOB); // Bob's first visit may go through onboarding; the session is what matters
    const list = await accounts(ctx);
    expect(list.active?.email).toBe(BOB);
    expect(list.accounts.map((a) => a.email)).toEqual([ADA]);
    expect(list.accounts[0].expired).toBe(false);
    const c = await compute(ctx);
    expect(c.account?.email).toBe(BOB);
    expect(c.plan).toBe("free");
    await seedChat(ctx, "thr_e2e_bob", "Bob's trip plan");
    await toApp(page);
    await seen(page, "Bob's trip plan");
    await expect(page.getByText("Ada's roadmap")).toHaveCount(0);
  });

  test("the saved cookies are HttpOnly, SameSite and not readable from the page", async () => {
    const cookies = await ctx.cookies();
    const parked = cookies.filter((c) => /keplar_acct_\d/.test(c.name));
    expect(parked.length).toBe(1);
    for (const c of parked) { expect(c.httpOnly).toBe(true); expect(c.sameSite).toBe("Lax"); expect(c.expires).toBeGreaterThan(Date.now() / 1000 + 50 * 86400); }
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/keplar_acct|session_token|session_data/);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toMatch(/keplar_acct|session_token/);
  });

  test("Switch account: Ada is back instantly with her own plan and chats, nothing of Bob's; then back to Bob", async () => {
    await openMenu(page);
    await page.locator(`[data-saved-account="${ADA}"] [data-account-action=switch]`).click();
    await page.waitForURL(/\/app/);
    await page.waitForSelector("[data-account-menu]");
    expect((await compute(ctx)).account?.email).toBe(ADA);
    expect((await compute(ctx)).plan).toBe("plus");
    await seen(page, "Ada's roadmap");
    await expect(page.getByText("Bob's trip plan")).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("bob")).length)).toBe(0);
    await expect(page.locator("[data-daily-left]")).toHaveCount(0); // Plus has credits, not the Free daily meter
    await openMenu(page);
    await page.locator(`[data-saved-account="${BOB}"] [data-account-action=switch]`).click();
    await page.waitForURL(/\/app/);
    await page.waitForSelector("[data-account-menu]");
    expect((await compute(ctx)).account?.email).toBe(BOB);
    await seen(page, "Bob's trip plan");
    await expect(page.getByText("Ada's roadmap")).toHaveCount(0);
    await expect(page.locator("[data-daily-left]")).toHaveText(/\d+ of 50 left/);
  });

  test("the Free meter shows N of 50 left and survives a refresh", async () => {
    const before = (await compute(ctx)).daily!;
    expect(before.limit).toBe(50);
    await toApp(page);
    await expect(page.locator("[data-daily-left]")).toHaveText(`${before.left} of 50 left`);
    await page.reload();
    await expect(page.locator("[data-daily-left]")).toHaveText(`${before.left} of 50 left`);
  });

  test("an account that expired is marked on its own with 'Sign in again'; the active one keeps working", async () => {
    // Ada is parked (Bob active). Replace her saved copy with a correctly signed one that ended a second ago.
    const slotCookie = (await ctx.cookies()).find((c) => /keplar_acct_\d/.test(c.name))!;
    const forged = run("forge-expired.ts", ADA);
    await ctx.addCookies([{ ...slotCookie, value: forged }]);
    const l = await accounts(ctx);
    expect(l.accounts[0]).toMatchObject({ email: ADA, expired: true });
    await toApp(page);
    await openMenu(page);
    const row = page.locator(`[data-saved-account="${ADA}"]`);
    await expect(row).toContainText("Sign in again");
    await expect(row.locator("[data-account-action=switch]")).toHaveCount(0);
    expect((await compute(ctx)).account?.email).toBe(BOB);
    await row.locator("[data-account-action=signin-again]").click();
    await page.waitForURL(/\/signin\?.*expired=/);
    await expect(page.getByText(ADA).first()).toBeVisible();
    // signing Ada in again (add mode) puts her back as the active account and keeps Bob signed in
    await signInWithLink(page, ADA);
    const after = await accounts(ctx);
    expect(after.active?.email).toBe(ADA);
    expect(after.accounts.map((a) => [a.email, a.expired])).toEqual([[BOB, false]]);
  });

  test("Sign out removes only the current account; the other one stays signed in", async () => {
    await toApp(page);
    await openMenu(page);
    await page.locator("[data-account-action=signout]").click();
    await page.waitForURL(/\/app/);
    await page.waitForSelector("[data-account-menu]");
    const l = await accounts(ctx);
    expect(l.active?.email).toBe(BOB);
    expect(l.accounts).toEqual([]);
    await seen(page, "Bob's trip plan");
  });

  test("Sign out of all accounts clears every account and cookie", async () => {
    // add Ada again so two are signed in
    await openMenu(page);
    await page.locator("[data-account-action=add]").click();
    await page.waitForURL(/add=1/);
    await signInWithLink(page, CY);
    expect((await accounts(ctx)).accounts.length).toBe(1);
    await toApp(page);
    await openMenu(page);
    await page.locator("[data-account-action=signout-all]").click();
    await page.waitForURL((u) => !u.pathname.startsWith("/app"));
    const l = await accounts(ctx);
    expect(l).toMatchObject({ active: null, accounts: [] });
    expect((await ctx.cookies()).filter((c) => /session|keplar_acct/.test(c.name))).toEqual([]);
    expect((await compute(ctx)).account).toBeNull();
  });

  test("cross-site requests cannot sign anyone out", async ({ browser }) => {
    const c2 = await browser.newContext();
    const p2 = await c2.newPage();
    await p2.goto("/signin?next=%2Fapp");
    await signInWithLink(p2, DEE);
    const bad = await c2.request.post("/api/account/accounts", { data: { action: "signout_all" }, headers: { origin: "https://evil.example", "content-type": "application/json" } });
    expect(bad.status()).toBe(403);
    expect((await accounts(c2)).active?.email).toBe(DEE);
    await c2.close();
  });
});
