import { test, expect, type Page } from "playwright/test";

/**
 * Router-learning signals from the chat UI, with the answer stream mocked (no live model needed):
 * thumbs up/down, copy, "Ask again" and a follow-up that corrects the last answer each send one small signal to
 * /api/learning/signal. Also checks the honest copy on the thumbs.
 */
const ANSWER = {
  id: "ans_e2e_1",
  markdown: "PostgreSQL is the safer default for billing because of transactions and constraints. MongoDB fits flexible documents.",
  consensus: { level: "strong", score: 0.9, agree: 3, disagree: 0, missing: 0, responded: 3, consulted: 3, summary: "Three models agree." },
  models: [
    { id: "m1", name: "Model One", provider: "p", slot: "panel", status: "responded", stance: "pg" },
    { id: "m2", name: "Model Two", provider: "p", slot: "panel", status: "responded", stance: "pg" },
    { id: "m3", name: "Model Three", provider: "p", slot: "panel", status: "responded", stance: "pg" },
  ],
  sources: [], disagreements: [], verification: { mode: "cross-check", summary: "Checked.", checks: [], notes: [] }, reasoning: "Compared three answers.", capabilities: ["Reasoning"], compute: { units: 3, level: "standard" }, durationMs: 4200,
};

async function mockKeplar(page: Page) {
  await page.route("**/api/keplar", (route) => route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "answer", answer: ANSWER }) + "\n" }));
}
const ask = async (page: Page, text: string) => {
  await page.locator("textarea:visible").first().fill(text);
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
};

test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.83.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
});

test("thumbs, copy, ask again and a correcting follow-up each send one learning signal", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await mockKeplar(page);
  const sent: { answerId: string; kind: string; text?: string }[] = [];
  await page.route("**/api/learning/signal", async (route) => {
    sent.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" });
  });
  await ask(page, "Compare PostgreSQL and MongoDB for billing");
  const up = page.getByRole("button", { name: "Good answer", exact: true });
  await expect(up).toBeVisible({ timeout: 30_000 });
  await expect(up).toHaveAttribute("title", /not retrained/);

  await up.click();
  await page.getByRole("button", { name: "Not a good answer", exact: true }).click();
  await page.getByRole("button", { name: /Copy answer/ }).click();
  await expect.poll(() => sent.map((s) => s.kind)).toEqual(["up", "down", "copy"]);
  expect(sent.every((s) => s.answerId === "ans_e2e_1")).toBe(true);
  expect(sent[0].text).toBeUndefined(); // positive signals carry no text
  expect(sent[1].text).toContain("PostgreSQL"); // the server keeps it only if the person opted in

  await page.getByRole("button", { name: "Ask again" }).click();
  await expect.poll(() => sent.map((s) => s.kind)).toEqual(["up", "down", "copy", "regenerate"]);

  await expect(page.getByRole("button", { name: "Good answer", exact: true })).toBeVisible({ timeout: 30_000 });
  await ask(page, "No, that's wrong");
  await expect.poll(() => sent.map((s) => s.kind)).toContain("correct");
});
