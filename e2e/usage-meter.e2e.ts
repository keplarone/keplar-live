import { test, expect, type Page, type BrowserContext } from "playwright/test";

/**
 * The sidebar "Keplar Usage" card and the "N of M left" counter in the top bar must agree.
 * Signs in for real, then edits only the numbers /api/compute returns (the page is the real app).
 */
const stamp = Date.now().toString(36);

async function signIn(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.92.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/signin?next=%2Fapp");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href: string | null = null;
  await expect(async () => {
    await page.goto("/dev/outbox");
    const all = await page.locator("a[href*='/signin/verify']").evaluateAll((as, em) => as.filter((a) => (a.parentElement?.parentElement?.textContent ?? "").includes(`to ${em}`)).map((a) => (a as HTMLAnchorElement).href), email); // this address's mail only
    href = all[0] ?? null;
    expect(href).toBeTruthy();
  }).toPass({ timeout: 30_000 });
  await page.goto(href!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(app|welcome)/, { timeout: 30_000 });
}

/** Make /api/compute report these numbers (the rest of the real response is kept). */
async function report(page: Page, patch: Record<string, unknown>) {
  await page.unroute("**/api/compute").catch(() => undefined);
  await page.route("**/api/compute", async (route) => {
    const res = await route.fetch();
    const j = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: { ...j, ...patch } });
  });
}
async function open(page: Page) {
  await page.goto("/app");
  await page.waitForSelector("[data-account-menu]", { timeout: 30_000 });
  // Minimal pass: the full usage readout lives in the account menu (the sidebar shows a short line only when usage is low).
  await page.locator("[data-account-menu] > button").first().click();
  await page.getByRole("menu", { name: "Account" }).waitFor();
}
const card = (page: Page) => page.locator("#keplar-sidebar [data-usage-left]").first();
const bar = (page: Page) => page.locator("#keplar-sidebar [role=meter][aria-label$='remaining']").first();

test.describe.serial("usage meter agrees everywhere", () => {
  let ctx: BrowserContext;
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    await signIn(page, `usage.${stamp}@example.com`);
  });
  test.afterAll(async () => { await ctx.close(); });

  test("Free: 23 of 50 left shows 46% left, not 100%", async () => {
    await report(page, { plan: "free", total: null, used: 0, admin: false, daily: { used: 27, limit: 50, left: 23, resetsAt: new Date(Date.now() + 3_600_000).toISOString() } });
    await open(page);
    await expect(page.locator("[data-daily-left]")).toContainText("23 of 50 left");
    await expect(page.locator("[data-daily-left]")).toBeHidden(); // 46% left is not low: the top bar stays quiet
    await expect(page.locator("#keplar-sidebar [data-usage-low]")).toHaveCount(0);
    await expect(card(page)).toHaveText("46% left");
    await expect(bar(page)).toHaveAttribute("aria-valuenow", "46");
    expect(await bar(page).locator("span").evaluate((e) => (e as HTMLElement).style.width)).toBe("46%");
    await expect(page.locator("#keplar-sidebar")).toContainText("23 of 50 left today");
    await expect(page.locator("#keplar-sidebar")).not.toContainText("100% left");
  });

  test("Free with the daily count missing shows no percentage", async () => {
    await report(page, { plan: "free", total: null, used: 0, admin: false, daily: null });
    await open(page);
    await expect(card(page)).toHaveText("–");
    await expect(bar(page)).toHaveCount(0);
    await expect(page.locator("#keplar-sidebar")).not.toContainText("100% left");
  });

  test("Plus: credits left over the allowance; admin: unlimited", async () => {
    await report(page, { plan: "plus", total: 1000, used: 250, admin: false, daily: null });
    await open(page);
    await expect(card(page)).toHaveText("75% left");
    await expect(bar(page)).toHaveAttribute("aria-valuenow", "75");
    await report(page, { plan: "pro", total: null, used: 12, admin: true, daily: null });
    await open(page);
    await expect(card(page)).toHaveText("Unlimited");
    await expect(bar(page)).toHaveCount(0);
  });

  test("the card text fits at phone width", async () => {
    await report(page, { plan: "free", total: null, used: 0, admin: false, daily: { used: 27, limit: 50, left: 23, resetsAt: new Date(Date.now() + 3_600_000).toISOString() } });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/app");
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await page.locator("#keplar-sidebar [data-account-menu] > button").first().click();
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    const bad = await page.locator("#keplar-sidebar").evaluate((nav) => {
      const box = nav.getBoundingClientRect();
      return [...nav.querySelectorAll<HTMLElement>("[data-usage-left], [data-usage-left] ~ *, a, button")].filter((e) => e.offsetParent !== null && (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > box.right + 1)).map((e) => e.textContent?.slice(0, 40));
    });
    expect(bad).toEqual([]);
  });

  test("a real Free account: sidebar % equals the top-bar count and both drop after a question, without reloading", async () => {
    await page.unroute("**/api/compute").catch(() => undefined);
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const read = async () => {
      const t = (await page.locator("[data-daily-left]").first().textContent()) ?? "";
      const m = /(\d+) of (\d+) left/.exec(t);
      expect(m, `top bar text "${t}"`).toBeTruthy();
      const left = Number(m![1]); const limit = Number(m![2]);
      const pct = Math.max(left > 0 ? 1 : 0, Math.floor((left / limit) * 100));
      const chip = page.locator("[data-account-menu] > button").first();
      if ((await chip.getAttribute("aria-expanded")) !== "true") await chip.click(); // typing in the composer closes the menu
      await expect(card(page)).toHaveText(`${pct}% left`);
      await expect(bar(page)).toHaveAttribute("aria-valuenow", String(pct));
      return left;
    };
    // Hold the answer back a moment so the drop that happens when the question is sent can be seen before the server settles it.
    await page.route("**/api/keplar", async (route) => { await new Promise((r) => setTimeout(r, 4000)); await route.continue(); });
    const before = await read();
    await page.locator("textarea:visible").first().fill("Reply with one short sentence: what is two plus two?");
    await page.getByRole("button", { name: /^Ask Keplar/ }).click();
    await expect(page.locator("[data-daily-left]").first()).toContainText(`${before - 1} of`, { timeout: 60_000 });
    expect(await read()).toBe(before - 1);
    await expect(page.locator("[role=log]")).toContainText(/\w/, { timeout: 60_000 });
    await page.waitForTimeout(1500);
    // Settled: the server either kept the question (before - 1) or gave it back because no answer came (before, as in this test setup); the card agrees with the top bar either way.
    expect([before, before - 1]).toContain(await read());
  });
});

