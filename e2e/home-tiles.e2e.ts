import { test, expect } from "playwright/test";

/**
 * Home tiles on the empty first thread. "Research a topic" and "Hand off a task" seed the composer with a mode, but from the
 * home screen "new-thread" changed neither the view nor the active thread, so the seed was never applied (live 2026-10-05:
 * clicking "Research a topic" left Deep Research off and the composer unfocused).
 */
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.86.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
});

test("'Research a topic' turns Deep Research on and focuses the composer; clicking again keeps it on", async ({ page }) => {
  const tiles = page.getByRole("list", { name: "What you can do" });
  const deep = page.locator("button[data-mode='deepResearch']") // off modes sit (hidden) in the Modes menu; an active one shows in the row;
  await expect(deep).toHaveAttribute("aria-pressed", "false");
  await tiles.getByRole("button", { name: /Research a topic/ }).click();
  await expect(deep).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("textarea").first()).toBeFocused();
  await tiles.getByRole("button", { name: /Research a topic/ }).click();
  await expect(deep).toHaveAttribute("aria-pressed", "true");
});

test("'Hand off a task' turns Agent on", async ({ page }) => {
  const agent = page.locator("button[data-mode='agent']");
  await expect(agent).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("list", { name: "What you can do" }).getByRole("button", { name: /Hand off a task/ }).click();
  await expect(agent).toHaveAttribute("aria-pressed", "true");
});
