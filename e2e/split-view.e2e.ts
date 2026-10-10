import { test, expect } from "playwright/test";

/** The disagreement view: "2 of 3 models agree", who said what, what Keplar did, shown under the answer (no click needed). The reply is mocked here. */
const answer = (disagreements: unknown[], consensus: Record<string, unknown>) => ({
  id: "ans_split1",
  markdown: "Use a hash map for the lookup.",
  consensus: { level: "partial", score: null, agree: 2, disagree: 1, missing: 0, responded: 3, consulted: 3, summary: "2 of 3 agree", ...consensus },
  models: [],
  sources: [],
  disagreements,
  verification: { mode: "cross-model", summary: "Reviewed.", reviewer: "Reviewer One", checks: [], notes: [] },
  reasoning: "",
  capabilities: [],
  compute: { units: 1, level: "low" },
  durationMs: 4000,
});

test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.85.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
});

async function reply(page: import("playwright/test").Page, a: unknown) {
  await page.route("**/api/keplar", (route) =>
    route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "answer", answer: a }) + "\n" }),
  );
  await page.locator("textarea:visible").first().fill("Which data structure should I use?");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
}

test("a split shows the count, each side, the difference and what Keplar did, right under the answer", async ({ page }) => {
  await reply(
    page,
    answer(
      [{
        topic: "Whether sorting first is worth it",
        positions: [
          { stance: "use a hash map", models: ["Model A", "Model B"], summary: "Constant-time lookups." },
          { stance: "sort first", models: ["Model C"], summary: "Binary search needs no extra memory." },
        ],
        resolution: "Went with the hash map; memory was not mentioned as a limit.",
      }],
      {},
    ),
  );
  const split = page.locator("[data-split]");
  await expect(split).toBeVisible({ timeout: 30_000 });
  await expect(split).toContainText("2 of 3 models agree");
  await expect(split).toContainText("2 of 3 say: use a hash map");
  await expect(split).toContainText("1 of 3 says: sort first");
  await expect(split).toContainText("Model A, Model B");
  await expect(split).toContainText("What Keplar did: Went with the hash map");
  await expect(split).toContainText("Reviewer One");
  await split.getByRole("button", { name: /full comparison/i }).click();
  await expect(page.locator("[data-section='disagreements']")).toHaveAttribute("aria-expanded", "true");
});

test("an even split is called a split, not an agreement", async ({ page }) => {
  await reply(
    page,
    answer(
      [{
        topic: "Which is faster",
        positions: [
          { stance: "A", models: ["Model A"], summary: "x" },
          { stance: "B", models: ["Model B"], summary: "y" },
        ],
        resolution: "",
      }],
      { level: "none", agree: 1, disagree: 1, responded: 2, consulted: 2 },
    ),
  );
  await expect(page.locator("[data-split]")).toContainText("The models split 1 – 1", { timeout: 30_000 });
});

test("when the models agree there is no split block", async ({ page }) => {
  await reply(page, answer([], { level: "consensus", agree: 3, disagree: 0 }));
  await expect(page.locator("article").last()).toContainText("hash map", { timeout: 30_000 });
  await expect(page.locator("[data-split]")).toHaveCount(0);
});

const twoSides = [{
  topic: "Whether sorting first is worth it",
  positions: [
    { stance: "use a hash map", models: ["Model A", "Model B"], summary: "Constant-time lookups." },
    { stance: "sort first", models: ["Model C"], summary: "Binary search needs no extra memory." },
  ],
  resolution: "Went with the hash map; memory was not mentioned as a limit.",
}];

test("desktop: positions sit side by side, with where they agree/differ and why this answer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await reply(page, answer(twoSides, {}));
  const split = page.locator("[data-split]");
  await expect(split).toBeVisible({ timeout: 30_000 });
  const boxes = await split.locator("ul").first().locator("> li").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }));
  expect(boxes.length).toBe(2);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2); // same row = side by side
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].w - 2);
  await expect(split.locator("[data-kind='agreed']")).toContainText("2 of 3 models took the same position: use a hash map.");
  await expect(split.locator("[data-kind='differ']")).toContainText("1 of 3 says: sort first.");
  await expect(split).toContainText("Why this answer");
  await expect(split).toContainText("Went with the hash map");
});

test("phone: the positions stack, nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reply(page, answer(twoSides, {}));
  const split = page.locator("[data-split]");
  await expect(split).toBeVisible({ timeout: 30_000 });
  const boxes = await split.locator("ul").first().locator("> li").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height, w: r.width }; }));
  expect(boxes.length).toBe(2);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].h - 2); // second one is below the first
  expect(Math.abs(boxes[0].x - boxes[1].x)).toBeLessThan(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("honesty: the stock resolution sentence is not shown as a reason", async ({ page }) => {
  await reply(page, answer([{ ...twoSides[0], resolution: "The synthesis weighed the evidence and reasoning behind each position; see the answer." }], {}));
  const split = page.locator("[data-split]");
  await expect(split).toBeVisible({ timeout: 30_000 });
  await expect(split).not.toContainText("weighed the evidence");
  await expect(split).toContainText("No specific reason for this choice was recorded");
});

test("source check (BETA): a real check shows links and per-claim states; Free shows why nothing was checked; no-source is said plainly", async ({ page }) => {
  const checked = { state: "checked", note: "1 of 2 checked claims are supported by pages found on the web. A supporting page is evidence, not proof.", engine: "exa", checkedAt: "2026-10-04T12:00:00.000Z", claims: [
    { text: "The Eiffel Tower was completed in 1889.", support: "supported", finding: "Two pages give 1889.", sources: [{ title: "Britannica", url: "https://www.britannica.com/topic/Eiffel-Tower-Paris-France" }] },
    { text: "It was designed by Gustave Eiffel personally.", support: "no_source", finding: "", sources: [] },
  ] };
  await reply(page, { ...answer([], { level: "consensus", agree: 3, disagree: 0 }), sourcing: checked });
  const box = page.locator("[data-source-checks='checked']");
  await expect(box).toBeVisible({ timeout: 30_000 });
  await expect(box).toContainText("BETA");
  await expect(box).toContainText("Supported by pages found");
  await expect(box).toContainText("No source found");
  await expect(box.getByRole("link", { name: "Britannica" })).toHaveAttribute("href", "https://www.britannica.com/topic/Eiffel-Tower-Paris-France");
  await expect(box.getByRole("link", { name: "Britannica" })).toHaveAttribute("rel", /noopener/);
});

test("source check: Free explains it is a paid-plan feature and shows no links or support states", async ({ page }) => {
  await reply(page, { ...answer([], { level: "consensus", agree: 3, disagree: 0 }), sourcing: { state: "free_plan", note: "Source checks run live web searches, so they are on paid plans. This answer was not checked against the web.", claims: [] } });
  const note = page.locator("[data-source-checks='free_plan']");
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toContainText("paid plans");
  await expect(note).toContainText("not checked against the web");
  await expect(page.locator("[data-support]")).toHaveCount(0);
});

test("source check: when a search found nothing, the card says no source was found", async ({ page }) => {
  await reply(page, { ...answer([], { level: "consensus", agree: 3, disagree: 0 }), sourcing: { state: "no_sources", note: "No source was found for the claims we checked, so none of them is confirmed by a page.", engine: "exa", checkedAt: "2026-10-04T12:00:00.000Z", claims: [{ text: "Some claim.", support: "no_source", finding: "", sources: [] }] } });
  const box = page.locator("[data-source-checks='no_sources']");
  await expect(box).toBeVisible({ timeout: 30_000 });
  await expect(box).toContainText("No source was found");
  await expect(box.getByRole("link")).toHaveCount(0);
});
