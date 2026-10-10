import { test, expect, type Page } from "playwright/test";

/**
 * Regression: a question sent before the startup requests finish (/api/compute decides whose chats are on screen, /api/faq fills the home list)
 * must survive them. Before the fix, the first /api/compute answer replaced the whole chat state with the stored one (and aborted the run),
 * so the answer vanished and the empty welcome home came back.
 */
const answer = {
  id: "ans_race", markdown: "Use Postgres.",
  consensus: { level: "consensus", score: null, agree: 3, disagree: 0, missing: 0, responded: 3, consulted: 3, summary: "3 agree" },
  models: [], sources: [], disagreements: [],
  verification: { mode: "not-needed", summary: "", checks: [], notes: [] },
  reasoning: "", capabilities: [], compute: { units: 1, level: "low" }, durationMs: 1000,
};

async function slow(page: Page, glob: string, ms: number) {
  let released = false;
  await page.route(glob, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    released = true;
    await route.continue().catch(() => undefined);
  });
  return () => released;
}

test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.91.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
});

test("a first question sent before /api/compute and /api/faq answer keeps its answer", async ({ page }) => {
  const computeDone = await slow(page, "**/api/compute", 5000);
  await slow(page, "**/api/faq", 6000); // the home list is not on screen once a chat is open, so it may never be asked for here
  await page.route("**/api/keplar", (route) => route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "answer", answer }) + "\n" }));
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
  expect(computeDone(), "the question goes out while /api/compute is still pending").toBe(false);
  await page.locator("textarea:visible").first().fill("pg or mysql?");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  await expect(page.locator("article").last()).toContainText("Use Postgres.", { timeout: 30_000 });
  // now let the startup requests land
  await expect.poll(() => computeDone(), { timeout: 20_000 }).toBe(true);
  await expect(page.locator("[data-app-ready]")).toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator("article").last()).toContainText("Use Postgres.");
  await expect(page.getByText("pg or mysql?").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Welcome/ })).toHaveCount(0);
  // and it was kept for this device: a reload shows the same chat
  await page.waitForTimeout(600);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  await page.locator("[data-app-ready]").waitFor({ timeout: 30_000 });
  await page.getByText("pg or mysql?").first().waitFor({ timeout: 10_000 });
});

test("a late /api/faq still fills the home list", async ({ page }) => {
  const faqDone = await slow(page, "**/api/faq", 5000);
  await page.goto("/app");
  await page.locator("[data-app-ready]").waitFor({ timeout: 30_000 });
  const section = page.getByTestId("home-faq");
  await expect(section).toHaveAttribute("data-faq", "loading");
  await expect(section.locator("li button").first()).toHaveText(/^Are you conscious\?$/); // fallback is shown at once, never an empty list
  await expect(section).toHaveAttribute("data-faq", "loaded", { timeout: 20_000 });
  expect(faqDone()).toBe(true);
  const j = (await (await page.request.get("/api/faq")).json()) as { items: { text: string }[] };
  await expect(section.locator("li button")).toHaveCount(j.items.length);
  expect(await section.locator("li button").first().textContent()).toBe("Are you conscious?");
});
