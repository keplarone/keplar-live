import { test, expect } from "playwright/test";

/** Each /app tab has its own URL. Same-tab clicks stay in the shell; the path updates; back/forward restores the tab. Bare /app redirects to the chat home. */
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.92.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
});

test("/app permanently redirects to the chat home", async ({ page }) => {
  const res = await page.goto("/app", { waitUntil: "domcontentloaded" });
  expect(res?.request().redirectedFrom() || page.url()).toBeTruthy();
  await page.waitForURL((url) => new URL(url).pathname === "/");
  expect(new URL(page.url()).pathname).toBe("/");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
  await page.locator("[data-app-ready]").waitFor({ timeout: 30_000 });
});

test("sidebar tabs update the path and highlight; back restores the previous tab", async ({ page }) => {
  await page.goto("/app/ask");
  await page.locator("[data-app-ready]").waitFor({ timeout: 30_000 });
  await page.locator('nav[aria-label="Keplar"] [data-nav="create"]').click();
  await expect(page).toHaveURL(/\/app\/create$/);
  await expect(page.locator('nav[aria-label="Keplar"] [data-nav="create"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('nav[aria-label="Keplar"] [aria-current="page"]')).toHaveCount(1); // only Create is highlighted
  await page.locator('nav[aria-label="Keplar"] [data-nav="projects"]').click();
  await expect(page).toHaveURL(/\/app\/projects$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/create$/);
  await expect(page.locator('nav[aria-label="Keplar"] [data-nav="create"]')).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/ask$/);
  await expect(page.locator("textarea").first()).toBeVisible();
});

test("deep links open the matching tab", async ({ page }) => {
  for (const [path, nav] of [["/app/agents", "agents"], ["/app/business", "business"], ["/app/slides", "slides"]] as const) {
    await page.goto(path);
    await page.locator("[data-app-ready]").waitFor({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(path);
    const more = page.locator('nav[aria-label="Keplar"] [data-more]');
    if (nav === "slides" && (await more.getAttribute("aria-expanded")) !== "true") await more.click();
    await expect(page.locator(`nav[aria-label="Keplar"] [data-nav="${nav}"]`)).toHaveAttribute("aria-current", "page");
  }
});
