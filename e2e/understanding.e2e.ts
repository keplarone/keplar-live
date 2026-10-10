import { test, expect, type Page } from "playwright/test";

/**
 * Conversation-aware understanding in a real browser (production build, instant paths: no live model needed).
 * "who made" -> "keplar one": the fragment is read as who made Keplar One (stated as an assumption), then resolved from history.
 * Also: an unresolvable message shows 2-3 chips that send the next message; the identity guards answer exactly.
 */
const ask = async (page: Page, text: string) => {
  await page.locator("textarea:visible").first().fill(text);
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
};

/** The newest Keplar reply: instant answers render as a plain reply, panel answers as an article. */
const reply = (page: Page) => page.locator('[class*="plainReply"], article').last();

test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.79.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
});

test("'who made' then 'keplar one': a useful answer with the assumption stated, no 'who made what?'", async ({ page }) => {
  await ask(page, "who made");
  const first = reply(page);
  await expect(first).toContainText("I'm reading \"who made\" as who made Keplar One", { timeout: 30_000 });
  await expect(first).toContainText("Hassen");
  await expect(first).toContainText("Hussain");
  await expect(page.getByText(/who made what/i)).toHaveCount(0);
  // the calm card: no rows that say "Not applicable" / "None" / "Not needed" at the top level
  await expect(page.getByText(/Not applicable|Not needed/)).toHaveCount(0);

  await ask(page, "keplar one");
  await expect(reply(page)).toContainText("Going by what we were just talking about", { timeout: 30_000 });
  await expect(reply(page)).toContainText("Hassen");
});

test("an unresolvable message gets clickable suggestions that send the next message", async ({ page }) => {
  await ask(page, "it");
  const chips = page.locator("[data-clarify-chips] button");
  await expect(chips.first()).toBeVisible({ timeout: 30_000 });
  const n = await chips.count();
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(3);
  const label = ((await chips.first().textContent()) ?? "").trim();
  await chips.first().click();
  await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  await expect(chips.first()).toBeDisabled();
});

test("identity guards: exact replies", async ({ page }) => {
  await ask(page, "are you human?");
  await expect(reply(page).locator("p").first()).toHaveText(/^\s*No\.\s*$/, { timeout: 30_000 });
  await ask(page, "are you conscious?");
  await expect(reply(page).locator("p").first()).toHaveText(/^\s*I can not disclose that\.\s*$/, { timeout: 30_000 });
});
