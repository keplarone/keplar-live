import { test, expect, type Page } from "playwright/test";

/**
 * Every Keplar reply is the same card: header ("Keplar Answer"), body, footer (copy, share, ask again). Guard replies, instant answers
 * (creator, pricing, clarify), jokes and errors included. None of them is bare text.
 */
const ask = async (page: Page, text: string) => {
  await page.locator("textarea[aria-describedby$='-hint']").fill(text);
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
};

test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.84.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
});

async function expectCard(page: Page, body: RegExp | string) {
  const card = page.locator("article").last();
  await expect(card).toContainText(body, { timeout: 30_000 });
  await expect(card.getByRole("heading", { name: /Keplar Answer/i })).toBeVisible();
  const foot = card.locator("footer");
  await expect(foot).toBeVisible();
  await expect(foot.getByRole("button", { name: /Copy answer/ })).toBeVisible();
  await expect(foot.getByRole("button", { name: /Share/i })).toBeVisible();
  await expect(foot.getByRole("button", { name: "Ask again" })).toBeVisible();
  return card;
}

test("guard replies sit in the answer card", async ({ page }) => {
  await ask(page, "are you conscious?");
  const card = await expectCard(page, "I can not disclose that.");
  await expect(card.locator("p").first()).toHaveText(/^\s*I can not disclose that\.\s*$/);
  await ask(page, "are you human?");
  await expect(page.locator("article")).toHaveCount(2, { timeout: 30_000 });
  await expectCard(page, "No.");
});

test("instant answers (creator, pricing) sit in the answer card", async ({ page }) => {
  await ask(page, "who made keplar?");
  await expectCard(page, "Hassen");
  await ask(page, "pricing");
  await expect(page.locator("article")).toHaveCount(2, { timeout: 30_000 });
  await expectCard(page, /Plus/);
});

test("a clarifying question keeps its chips inside the card", async ({ page }) => {
  await ask(page, "it");
  const card = await expectCard(page, /\?/);
  await expect(card.locator("[data-clarify-chips] button").first()).toBeVisible();
});

test("an error sits in the same card shell (header, message, retry)", async ({ page }) => {
  await page.route("**/api/keplar", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Something went wrong. Please try again.", code: "internal" }) }));
  await ask(page, "what is the capital of Australia?");
  const card = page.locator("article[data-notice]").last();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole("heading", { name: /Keplar Answer/i })).toBeVisible();
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(card.getByRole("button", { name: /Retry/ })).toBeVisible();
});

test("the card has one style: plain replies and notices share the answer card's shell", async ({ page }) => {
  await ask(page, "are you conscious?");
  const plain = page.locator("article").last();
  await expect(plain).toContainText("I can not disclose that.", { timeout: 30_000 });
  const style = await plain.evaluate((el) => { const c = getComputedStyle(el); return { radius: c.borderRadius, shadow: c.boxShadow !== "none", pad: c.paddingTop }; });
  expect(style.shadow).toBe(true);
  expect(parseFloat(style.radius)).toBeGreaterThan(8);
  expect(parseFloat(style.pad)).toBeGreaterThan(8);
});
