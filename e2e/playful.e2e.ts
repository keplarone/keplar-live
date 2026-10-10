import { test, expect, type Page } from "playwright/test";

/**
 * Jokes, riddles and knock-knock in a real browser (production build). The knock-knock turns are fixed replies (no model), so the
 * whole game is deterministic. Model-written jokes need live models, which this build does not have (the unit tests cover runPlayful with a fake
 * registry); they are checked on the deployed site.
 */
const ask = async (page: Page, text: string) => {
  await page.locator("textarea:visible").first().fill(text);
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
};
const cards = (page: Page) => page.locator("article[data-plain]");

test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.83.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
});

test("knock knock: Who's there? -> <name> who? -> a reaction, every turn in the answer card", async ({ page }) => {
  await ask(page, "knock knock");
  await expect(cards(page).last()).toContainText("Who's there?", { timeout: 30_000 });
  await ask(page, "Boo");
  await expect(cards(page).last()).toContainText("Boo who?", { timeout: 30_000 });
  await ask(page, "Don't cry, it's only a joke");
  await expect(cards(page)).toHaveCount(3, { timeout: 30_000 });
  const last = cards(page).last();
  await expect(last.getByRole("heading", { name: /Keplar Answer/i })).toBeVisible();
  await expect(last.getByRole("button", { name: /Copy answer/ })).toBeVisible();
  // no overview of the joke format, no Details, no sections
  await expect(page.locator("article").getByText(/useful next steps|Details|Overview|Not applicable/i)).toHaveCount(0);
});

test("knock knock, Keplar leads: Knock knock. -> name -> punchline", async ({ page }) => {
  await ask(page, "tell me a knock knock joke");
  await expect(cards(page).last()).toContainText("Knock knock.", { timeout: 30_000 });
  await ask(page, "who's there?");
  await expect(cards(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(cards(page).last().getByRole("button", { name: /Copy answer/ })).toBeVisible({ timeout: 30_000 }); // typing finished
  const name = ((await cards(page).last().locator("p").first().textContent()) ?? "").replace(/\.$/, "").trim();
  expect(name.length).toBeGreaterThan(1);
  await ask(page, `${name} who?`);
  await expect(cards(page)).toHaveCount(3, { timeout: 30_000 });
  await expect(cards(page).last().getByRole("button", { name: /Copy answer/ })).toBeVisible({ timeout: 30_000 });
  const punch = (await cards(page).last().locator("p").first().textContent()) ?? "";
  expect(punch.length).toBeGreaterThan(8);
  expect(punch.split(/\s+/).length).toBeLessThanOrEqual(14);
});

test("a classic riddle is answered at once, in one line", async ({ page }) => {
  await ask(page, "why did the chicken cross the road");
  await expect(cards(page).last()).toContainText("To get to the other side.", { timeout: 30_000 });
  await expect(page.locator("article").getByText(/Details/)).toHaveCount(0);
});
