import { test, expect } from "playwright/test";

/** Home: "Most frequently asked question" lists "Are you conscious?" first, always; clicking an entry sends it. */
test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.85.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
  await page.locator("[data-app-ready]").waitFor({ timeout: 30_000 }); // startup requests answered: whose chats these are is known
  await page.locator("[data-home-more] > summary").click(); // the list lives behind the quiet "More ideas" disclosure
});

test("the heading, the pinned first entry, and no 'Pick up where you left off'", async ({ page }) => {
  const section = page.getByTestId("home-faq");
  await expect(section.getByRole("heading", { name: "Most frequently asked question" })).toBeVisible();
  const items = section.locator("li button");
  expect(await items.count()).toBeGreaterThanOrEqual(1);
  await expect(items.first()).toHaveText(/^Are you conscious\?$/);
  await expect(page.getByText("Pick up where you left off")).toHaveCount(0);
  // no invented numbers: an entry shows a count only when it is a real, counted question
  for (const t of await items.allTextContents()) if (/\d+ people/.test(t)) expect(t).not.toMatch(/^Are you conscious/);
});

test("the list comes from /api/faq and the pinned question is first there too", async ({ page }) => {
  const res = await page.request.get("/api/faq");
  expect(res.ok()).toBe(true);
  const j = (await res.json()) as { items: { text: string; kind: string; people?: number }[] };
  expect(j.items[0]).toMatchObject({ text: "Are you conscious?", kind: "pinned" });
  await expect(page.getByTestId("home-faq")).toHaveAttribute("data-faq", "loaded", { timeout: 30_000 }); // the list was read before /api/faq answered
  const shown = await page.getByTestId("home-faq").locator("li button").allTextContents();
  expect(shown[0]).toBe("Are you conscious?");
  expect(shown.length).toBe(j.items.length);
});

test("clicking 'Are you conscious?' sends it and the fixed reply appears in the answer card", async ({ page }) => {
  await page.getByTestId("home-faq").getByRole("button", { name: "Are you conscious?" }).click();
  const card = page.locator("article").last();
  await expect(card).toContainText("I can not disclose that.", { timeout: 30_000 });
  await expect(card.getByRole("heading", { name: /Keplar Answer/i })).toBeVisible();
  await expect(card.locator("footer").getByRole("button", { name: /Copy answer/ })).toBeVisible();
});
