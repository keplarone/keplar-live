import { test, expect } from "playwright/test";

/** The home hero is one screen. The headline is real text, and it settles on the sentence. */
test("home headline is the sentence, on one screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const h1 = page.locator("h1").first();
  await expect(h1).toContainText("One question.", { timeout: 20_000 });
  await expect(h1).toContainText("One answer.");
  await expect(page.locator("#hero-q")).toBeVisible();
  const height = await page.locator("section[aria-label='Keplar']").evaluate((el) => (el as HTMLElement).getBoundingClientRect().height);
  expect(height).toBeLessThan(800 * 1.35);
});

test("reduced motion still shows the sentence", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("h1").first()).toContainText("Multiple intelligences.", { timeout: 20_000 });
  await ctx.close();
});
