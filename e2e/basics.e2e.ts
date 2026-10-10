import { test, expect, type Page } from "playwright/test";

/** Basics people compare first: export a chat, edit and resend a message, see the keyboard shortcuts. The reply is mocked. */
const answer = {
  id: "ans_b1", markdown: "Use Postgres.",
  consensus: { level: "consensus", score: null, agree: 3, disagree: 0, missing: 0, responded: 3, consulted: 3, summary: "3 agree" },
  models: [], sources: [], disagreements: [],
  verification: { mode: "not-needed", summary: "", checks: [], notes: [] },
  reasoning: "", capabilities: [], compute: { units: 1, level: "low" }, durationMs: 1000,
};

async function ask(page: Page, text: string) {
  await page.route("**/api/keplar", (route) =>
    route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "answer", answer }) + "\n" }),
  );
  await page.locator("textarea:visible").first().fill(text);
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  await expect(page.locator("article").last()).toContainText("Use Postgres.", { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.86.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
  await page.locator("[data-app-ready]").waitFor({ timeout: 30_000 }); // startup requests answered: whose chats these are is known
});

test("export chat downloads a Markdown file with the questions and answers", async ({ page }) => {
  await ask(page, "pg or mysql?");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("[data-export]").click()]);
  expect(dl.suggestedFilename()).toMatch(/\.md$/);
  const text = (await (await import("node:fs/promises")).readFile(await dl.path(), "utf8"));
  expect(text).toContain("pg or mysql?");
  expect(text).toContain("Use Postgres.");
});

test("edit puts your message back in the box", async ({ page }) => {
  await ask(page, "pg or mysql?");
  await page.locator("[data-edit-message]").first().click();
  await expect(page.locator("textarea[aria-describedby$='-hint']")).toHaveValue("pg or mysql?");
});

test("? shows the keyboard shortcuts, Escape closes them", async ({ page }) => {
  await ask(page, "pg or mysql?");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("?");
  const dlg = page.locator("[data-shortcuts]");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("Search chats");
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
});
