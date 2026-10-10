import { test, expect } from "playwright/test";

/** The Feedback page shows a visible mailto fallback to team@keplar.one and still accepts a message. */
test("feedback page: mailto fallback to team@keplar.one is visible, sending works, text fits at phone width", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.93.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/feedback");
  const link = page.locator("[data-feedback-mailto] a");
  await expect(link).toBeVisible();
  await expect(link).toHaveText("team@keplar.one");
  await expect(link).toHaveAttribute("href", /^mailto:team@keplar\.one\?subject=/);
  const fits = await page.locator("[data-feedback-mailto]").evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
  expect(fits).toBe(true);
  await page.getByLabel("Tell us").fill("e2e feedback check");
  const [req] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/feedback") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  expect(req.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
});
