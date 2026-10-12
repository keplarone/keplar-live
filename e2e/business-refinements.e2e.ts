import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const business = (base: string) => base.replace("localhost", "business.localhost");
test("Business pricing: allowance summaries, expandable inclusions and usable mobile comparison", async ({ page, baseURL }) => {
  await page.route("**/api/business/account", route => route.fulfill({ json: { signedIn: false } }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto(business(baseURL!) + "/?layout=" + width + "#pricing");
    await expect(page.getByRole("heading", { name: "One workspace. Room to grow." })).toBeVisible();
    const cookies = page.getByRole("button", { name: "Reject non-essential", exact: true });
    if (await cookies.isVisible()) await cookies.click();
    const cards = page.locator("#pricing article");
    await expect(cards).toHaveCount(4);
    await expect(cards.first()).toContainText("30,000");
    await expect(cards.first().locator("details")).not.toHaveAttribute("open", "");
    await cards.first().locator("summary").click();
    await expect(cards.first().locator("details")).toHaveAttribute("open", "");
    await expect(cards.first().getByRole("link", { name: "Choose Starter" })).toHaveAttribute("href", "/account?tier=starter");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: "test-results/business-pricing-" + width + ".png", fullPage: false, animations: "disabled" });
    await page.addScriptTag({ content: axe });
    const bad = await page.evaluate(async () => {
      // @ts-expect-error axe is injected for this test
      const result = await window.axe.run(document.querySelector("#pricing"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter((v: { impact: string }) => ["serious", "critical"].includes(v.impact)).map((v: { id: string; nodes: { failureSummary: string }[] }) => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) }));
    });
    expect(bad).toEqual([]);
    if (width < 600) {
      const comparison = page.getByRole("region", { name: "Compare Business plan limits" });
      await comparison.scrollIntoViewIfNeeded();
      await comparison.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      expect(await comparison.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
  }
});

test("Business mobile navigation closes, traps focus, restores it, and does not affect desktop collapse", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/business/account", route => route.fulfill({ json: { signedIn: true, email: "qa@example.com", active: true, account: { company: "Example team" }, plan: { name: "Keplar Business Growth" } } }));
  await page.route("**/api/projects", route => route.fulfill({ json: { projects: [] } }));
  await page.route("**/api/business/reports", route => route.fulfill({ json: { reports: [] } }));
  await page.goto(business(baseURL!) + "/work");
  const open = page.getByRole("button", { name: "Open navigation", exact: true });
  await open.click();
  const drawer = page.getByRole("dialog", { name: "Business workspace" });
  await expect(drawer).toBeVisible();
  const close = drawer.getByRole("button", { name: "Close navigation", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("button", { name: "Sign out of qa@example.com" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.screenshot({ path: "test-results/business-mobile-navigation.png", animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await drawer.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(open).toBeFocused();
  await open.click();
  await expect(drawer).toBeVisible();
  const backdrop = page.getByRole("button", { name: "Close navigation", exact: true }).first();
  const bounds = await backdrop.boundingBox();
  expect(bounds).not.toBeNull();
  // Stay inside the scrim: the page reserves a scrollbar gutter on Windows.
  await backdrop.click({ position: { x: bounds!.width - 12, y: bounds!.height / 2 } });
  await expect(drawer).toHaveCount(0);
  await expect(open).toBeFocused();
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toBeFocused();
  await composer.focus();
  await page.keyboard.press("Alt+m");
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toHaveValue("research");
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show sidebar", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await open.click();
  await expect(drawer).toBeVisible();
  await close.click();
  await expect(open).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Workspace modules" })).toBeVisible();
});
