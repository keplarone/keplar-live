import { test, expect, type Page, type BrowserContext } from "playwright/test";

/**
 * Limit-reached card: "Buy more" + Upgrade for paid plans, honest copy for Free, unavailable when no Whop pack plan is configured.
 * Signs in for real and fakes only the numbers /api/compute reports and the one /api/keplar answer (a limit event); the app is real.
 * The Whop plan ids are NOT set on this server, so the real /api/billing/extensions answers "unavailable"; the on-sale case mocks it.
 */
const stamp = Date.now().toString(36);

async function signIn(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.93.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/signin?next=%2Fapp");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href: string | null = null;
  await expect(async () => {
    await page.goto("/dev/outbox");
    const all = await page.locator("a[href*='/signin/verify']").evaluateAll((as, em) => as.filter((a) => (a.parentElement?.parentElement?.textContent ?? "").includes(`to ${em}`)).map((a) => (a as HTMLAnchorElement).href), email);
    href = all[0] ?? null;
    expect(href).toBeTruthy();
  }).toPass({ timeout: 30_000 });
  await page.goto(href!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(app|welcome)/, { timeout: 30_000 });
}

async function report(page: Page, patch: Record<string, unknown>) {
  await page.unroute("**/api/compute").catch(() => undefined);
  await page.route("**/api/compute", async (route) => {
    const res = await route.fetch();
    const j = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: { ...j, ...patch } });
  });
}
const nd = (...events: object[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
async function answerWith(page: Page, body: string, status = 200) {
  await page.unroute("**/api/keplar").catch(() => undefined);
  await page.route("**/api/keplar", (route) => route.fulfill({ status, contentType: status === 200 ? "application/x-ndjson" : "application/json", body }));
}
async function ask(page: Page) {
  await page.goto("/app");
  await page.waitForSelector("[data-account-menu]", { timeout: 30_000 });
  await page.locator("textarea:visible").first().fill("Summarise this for me please");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
}
const PACKS = { plan: "plus", eligible: true, available: true, validDays: 90, balance: null, packs: [{ id: "small", label: "Small", credits: 1500, priceUsd: 12 }, { id: "medium", label: "Medium", credits: 4000, priceUsd: 30 }] };
const plus = { plan: "plus", total: 6000, used: 6000, admin: false, daily: null, windows: null };
const resets = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

test.describe.serial("limit extensions", () => {
  let ctx: BrowserContext;
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await ctx.newPage();
    await signIn(page, `ext.${stamp}@example.com`);
  });
  test.afterAll(async () => { await ctx.close(); });

  test("not configured: the card says extra credits are not on sale yet, shows no Buy more, and still offers Upgrade", async () => {
    await report(page, plus);
    await page.route("**/api/billing/extensions", (route) => (route.request().method() === "GET" ? route.fulfill({ json: { ...PACKS, available: false, packs: [] } }) : route.continue()));
    await answerWith(page, nd({ type: "limit", required: 120, remaining: 0 }));
    await ask(page);
    const card = page.locator("section[role=alert]").filter({ hasText: /used this month/i });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.locator("[data-extension=unavailable]")).toContainText(/aren.t on sale yet/i);
    await expect(card.getByRole("button", { name: "Buy more" })).toHaveCount(0);
    await expect(card.getByRole("link", { name: /Upgrade to/ })).toBeVisible();
  });

  test("on sale: Buy more opens the packs with credits and prices; picking one asks the server and goes to Whop", async () => {
    await page.unroute("**/api/billing/extensions").catch(() => undefined);
    let posted: unknown = null;
    await page.route("**/api/billing/extensions", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: PACKS });
      posted = route.request().postDataJSON();
      return route.fulfill({ json: { url: "https://whop.com/checkout/plan_test?x=1" } });
    });
    await page.route("https://whop.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Whop checkout</title>" }));
    await answerWith(page, nd({ type: "limit", required: 120, remaining: 0 }));
    await ask(page);
    const card = page.locator("section[role=alert]").filter({ hasText: /used this month/i });
    const buy = card.getByRole("button", { name: "Buy more" });
    await expect(buy).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole("link", { name: /Upgrade to/ })).toBeVisible();
    await expect(buy).toHaveAttribute("aria-expanded", "false");
    await buy.click();
    await expect(buy).toHaveAttribute("aria-expanded", "true");
    await expect(card.locator("[data-pack=small]")).toContainText("1,500 credits");
    await expect(card.locator("[data-pack=small]")).toContainText("$12");
    await expect(card.locator("[data-pack=medium]")).toContainText("4,000 credits");
    await expect(card).toContainText("90 days");
    await card.locator("[data-pack=medium]").click();
    await page.waitForURL(/^https:\/\/whop\.com\//, { timeout: 15_000 });
    expect(posted).toEqual({ pack: "medium" });
  });

  test("a weekly/5-hour window limit offers Buy more too", async () => {
    await page.unroute("**/api/billing/extensions").catch(() => undefined);
    await page.route("**/api/billing/extensions", (route) => route.fulfill({ json: PACKS }));
    await report(page, { ...plus, used: 100 });
    await answerWith(page, nd({ type: "limit", required: 300, remaining: 0, window: { id: "weekly", label: "Weekly", resetsAt: resets(), message: "weekly" } }));
    await ask(page);
    const card = page.locator("section[role=alert][data-window=weekly]");
    await expect(card).toContainText(/weekly .*limit/i, { timeout: 30_000 });
    await expect(card.getByRole("button", { name: "Buy more" })).toBeVisible();
    await expect(card).toContainText("monthly credits are kept");
  });

  test("a checkout failure is shown as a message, nothing else changes", async () => {
    await page.unroute("**/api/billing/extensions").catch(() => undefined);
    await page.route("**/api/billing/extensions", (route) => (route.request().method() === "GET" ? route.fulfill({ json: PACKS }) : route.fulfill({ status: 502, json: { error: "Checkout couldn't start. Please try again in a moment." } })));
    await answerWith(page, nd({ type: "limit", required: 120, remaining: 0 }));
    await ask(page);
    const card = page.locator("section[role=alert]").filter({ hasText: /used this month/i });
    await card.getByRole("button", { name: "Buy more" }).click();
    await card.locator("[data-pack=small]").click();
    await expect(card.getByRole("alert")).toContainText(/couldn.t start/i);
    expect(page.url()).toContain("/app");
  });

  test("Free: the daily limit card says Free uses free models only, has no Buy more, and offers Upgrade", async () => {
    await page.unroute("**/api/billing/extensions").catch(() => undefined);
    const reset = new Date(Date.now() + 5 * 3_600_000).toISOString();
    await report(page, { plan: "free", total: null, used: 0, admin: false, daily: { used: 50, limit: 50, left: 0, resetsAt: reset } });
    await answerWith(page, JSON.stringify({ error: "x", code: "daily_limit", plan: "free", daily: { used: 50, limit: 50, left: 0, resetsAt: reset } }), 429);
    await ask(page);
    const card = page.locator("section[data-daily-limit]");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("today’s 50 Free questions");
    await expect(card).toContainText(/free models only/i);
    await expect(card.locator("[data-extension=free]")).toBeVisible();
    await expect(card.getByRole("button", { name: "Buy more" })).toHaveCount(0);
    await expect(card.getByRole("link", { name: /Upgrade to Plus/ })).toBeVisible();
    await expect(page.locator("[data-daily-left]").first()).toContainText("0 of 50 left");
  });

  test("the account menu shows the extra credits beside the plan's own percentage", async () => {
    await page.unroute("**/api/keplar").catch(() => undefined);
    await report(page, { ...plus, used: 6000, extension: { balance: 310, expiresAt: "2026-12-31T12:00:00.000Z", latestGrantAt: "2026-10-01T00:00:00.000Z", grants: [] } });
    await page.goto("/app");
    await page.waitForSelector("[data-account-menu]", { timeout: 30_000 });
    await expect(page.locator("#keplar-sidebar [data-usage-low]")).toBeVisible(); // 0% left: the low-usage line shows in the sidebar
    await page.locator("[data-account-menu] button").first().click(); // the full readout lives in the account menu
    await expect(page.locator("#keplar-sidebar [data-extension-credits]")).toContainText(/\+310 extra credits · until /);
    await expect(page.locator("#keplar-sidebar [data-usage-left]").first()).toHaveText("0% left");
  });

  test("back from checkout: waits for the verified webhook, then confirms the credits (it grants nothing itself)", async () => {
    const fresh = new Date().toISOString();
    let n = 0;
    await page.unroute("**/api/compute").catch(() => undefined);
    await page.route("**/api/compute", async (route) => {
      const res = await route.fetch();
      const j = (await res.json()) as Record<string, unknown>;
      n++;
      await route.fulfill({ response: res, json: { ...j, ...plus, extension: n >= 3 ? { balance: 1500, expiresAt: resets(), latestGrantAt: fresh, grants: [] } : { balance: 0, expiresAt: null, latestGrantAt: null, grants: [] } } });
    });
    await page.goto("/app?extension=success");
    await expect(page.getByRole("list", { name: "Notifications" })).toContainText(/Confirming your purchase/i, { timeout: 15_000 });
    await expect(page.getByRole("list", { name: "Notifications" })).toContainText(/extra credits are in/i, { timeout: 30_000 });
    expect(page.url()).not.toContain("extension=success");
  });

  test("real server: Free cannot start an extension checkout; signed-out is refused", async () => {
    await page.unroute("**/api/compute").catch(() => undefined);
    await page.unroute("**/api/billing/extensions").catch(() => undefined);
    const g = await page.request.get("/api/billing/extensions");
    expect(g.status()).toBe(200);
    const j = await g.json();
    expect(j.eligible).toBe(false);
    expect(j.available).toBe(false);
    expect(j.packs).toEqual([]);
    const origin = new URL(page.url()).origin;
    const p = await page.request.post("/api/billing/extensions", { data: { pack: "small" }, headers: { origin } });
    expect([403, 503]).toContain(p.status());
    const anon = await (await ctx.browser()!.newContext()).request.get(`${origin}/api/billing/extensions`);
    expect(anon.status()).toBe(401);
  });
});
