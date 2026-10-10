import { test, expect, type Page } from "playwright/test";

/** Modes that are off live in the composer's "Modes" menu; turning one on puts its chip back in the row. */
async function enableMode(page: Page, key: string) {
  await page.getByRole("button", { name: /^More modes/ }).click();
  await page.locator(`[data-more-mode='${key}']`).click();
}

/**
 * Debate mode (BETA). The provider side is mocked in the browser: /api/keplar answers with a REAL stream (a ReadableStream that emits the
 * engine's events with pauses), so the test sees turns appear one by one while the request is still open, then the final answer.
 * The engine side (rounds, transcript, metering) is covered by tests/debate.test.ts against a stubbed OpenRouter.
 */

const answer = {
  id: "ans_debate1",
  markdown: "Both are fine in moderation for most adults. Tea has less caffeine per cup.",
  consensus: { level: "consensus", score: null, agree: 2, disagree: 0, missing: 0, responded: 2, consulted: 2, summary: "2 of 2 agree" },
  models: [],
  sources: [],
  disagreements: [],
  verification: { mode: "cross-model", summary: "Reviewed.", reviewer: "Reviewer One", checks: [], notes: [] },
  reasoning: "",
  capabilities: [],
  compute: { units: 3, level: "low" },
  durationMs: 9000,
  debate: {
    beta: true,
    rounds: 2,
    changed: 1,
    speakers: [{ seat: 0, name: "Alpha Model" }, { seat: 1, name: "Beta Model" }],
    turns: [
      { round: 1, seat: 0, name: "Alpha Model", ok: true, position: "Tea is healthier.", update: null, why: "", text: "Less caffeine and more L-theanine." },
      { round: 1, seat: 1, name: "Beta Model", ok: true, position: "Coffee is just as healthy.", update: null, why: "", text: "Large cohort studies link moderate coffee to lower mortality." },
      { round: 2, seat: 0, name: "Alpha Model", ok: true, position: "Both are fine in moderation.", update: "changed", why: "The cohort data was convincing.", text: "Dose matters more than the drink." },
      { round: 2, seat: 1, name: "Beta Model", ok: true, position: "Both are fine; tea has less caffeine.", update: "refined", why: "Conceded the caffeine point.", text: "At three cups, either is fine." },
    ],
  },
};

const T = (round: number, seat: number, name: string, position: string, text: string, update: string | null = null, why = "") => ({ type: "debate", debate: { phase: "turn", round, seat, name, status: "ok", position, update, why, text } });

/** [delay before, event] */
const script = (pause: number): Array<[number, unknown]> => [
  [50, { type: "stage", stage: "understand", status: "active" }],
  [50, { type: "stage", stage: "understand", status: "done" }],
  [50, { type: "stage", stage: "select", status: "active" }],
  [50, { type: "capabilities", items: [], mode: "consensus", modelCount: 2 }],
  [50, { type: "stage", stage: "select", status: "done", detail: "Selected 2 intelligences" }],
  [50, { type: "stage", stage: "debate", status: "active" }],
  [50, { type: "debate", debate: { phase: "start", rounds: 2, speakers: answer.debate.speakers } }],
  [50, { type: "debate", debate: { phase: "round", round: 1, of: 2 } }],
  [50, { type: "debate", debate: { phase: "turn_start", round: 1, seat: 0 } }],
  [50, { type: "debate", debate: { phase: "turn_start", round: 1, seat: 1 } }],
  [pause, { type: "debate", debate: { phase: "delta", round: 1, seat: 0, text: "POSITION: Tea is healthier.\nLess caffeine" } }],
  [pause, T(1, 0, "Alpha Model", "Tea is healthier.", "Less caffeine and more L-theanine.")],
  [pause, T(1, 1, "Beta Model", "Coffee is just as healthy.", "Large cohort studies link moderate coffee to lower mortality.")],
  [pause, { type: "debate", debate: { phase: "round", round: 2, of: 2 } }],
  [50, { type: "debate", debate: { phase: "turn_start", round: 2, seat: 0 } }],
  [50, { type: "debate", debate: { phase: "turn_start", round: 2, seat: 1 } }],
  [pause, T(2, 0, "Alpha Model", "Both are fine in moderation.", "Dose matters more than the drink.", "changed", "The cohort data was convincing.")],
  [pause, T(2, 1, "Beta Model", "Both are fine; tea has less caffeine.", "At three cups, either is fine.", "refined", "Conceded the caffeine point.")],
  [50, { type: "debate", debate: { phase: "done", rounds: 2, changed: 1 } }],
  [50, { type: "stage", stage: "debate", status: "done", detail: "2 rounds · 1 changed position" }],
  [50, { type: "stage", stage: "compare", status: "active" }],
  [50, { type: "model", modelId: "a", name: "Alpha Model", status: "responded" }],
  [50, { type: "model", modelId: "b", name: "Beta Model", status: "responded" }],
  [50, { type: "stage", stage: "compare", status: "done" }],
  [50, { type: "stage", stage: "synthesize", status: "active" }],
  [pause, { type: "answer", answer }],
];

async function mockStream(page: Page, pause: number) {
  await page.addInitScript(({ events }) => {
    const w = window as unknown as { __keplarBodies: unknown[]; __keplarAborted: boolean };
    w.__keplarBodies = [];
    w.__keplarAborted = false;
    const real = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/keplar")) return real(input, init);
      w.__keplarBodies.push(JSON.parse(String(init?.body ?? "{}")));
      const signal = init?.signal;
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(c) {
          for (const [wait, ev] of events) {
            await new Promise((r) => setTimeout(r, wait));
            if (signal?.aborted) { w.__keplarAborted = true; c.error(new DOMException("Aborted", "AbortError")); return; }
            c.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
          }
          c.close();
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
    };
  }, { events: script(pause) });
}

test("Debate: the chip turns it on, turns stream in live round by round, then one Keplar answer with the debate under it", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.87.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await mockStream(page, 700);
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });

  const chip = page.locator("button[data-mode='debate']");
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await enableMode(page, "debate");
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(chip).toBeVisible();
  await expect(page.locator("[data-debate-note]")).toContainText("Debate · Beta");

  await page.locator("textarea:visible").first().fill("Is tea or coffee healthier?");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();

  const live = page.locator("[data-debate-live]");
  await expect(live).toBeVisible({ timeout: 30_000 });
  // Round 1 arrives while the request is still streaming: the opening is visible and the answer is not there yet.
  const first = page.locator("[data-debate-turn='1-0']");
  await expect(first).toContainText("Tea is healthier.", { timeout: 15_000 });
  await expect(page.getByText("Both are fine in moderation for most adults.")).toHaveCount(0);
  await expect(page.locator("[data-debate-turn='2-0']")).toHaveCount(0);
  await expect(live).toContainText("Round 1 of 2");
  // Round 2: the model says it changed position after reading the other.
  const changed = page.locator("[data-debate-turn='2-0']");
  await expect(changed).toContainText("Changed position", { timeout: 15_000 });
  await expect(changed).toContainText("The cohort data was convincing.");
  // Then ONE answer on the normal card, with the debate collapsed under it.
  await expect(page.locator("article").last()).toContainText("Both are fine in moderation for most adults.", { timeout: 20_000 });
  await expect(live).toHaveCount(0);
  const record = page.locator("[data-debate-record]");
  await expect(record).toContainText("2 rounds · 2 models · 1 changed position");
  const toggle = record.getByRole("button", { name: /How the debate went/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(record).toContainText("Round 1 · Opening positions");
  await expect(record).toContainText("Large cohort studies");

  const bodies = await page.evaluate(() => (window as unknown as { __keplarBodies: Array<{ modes?: { debate?: boolean } }> }).__keplarBodies);
  expect(bodies[0]?.modes?.debate).toBe(true);
  await ctx.close();
});

test("Debate: Stop during the debate aborts the stream and says what happened", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.88.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await mockStream(page, 1500);
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
  await enableMode(page, "debate");
  await page.locator("textarea:visible").first().fill("Is tea or coffee healthier?");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  await expect(page.locator("[data-debate-turn='1-0']")).toContainText("Tea is healthier.", { timeout: 20_000 });
  await page.getByRole("button", { name: /Stop generating/ }).click();
  await expect(page.getByText(/The debate was stopped/)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-debate-live]")).toContainText("Debate stopped");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __keplarAborted: boolean }).__keplarAborted), { timeout: 10_000 }).toBe(true);
  await expect(page.locator("[data-debate-turn='2-0']")).toHaveCount(0);
  await ctx.close();
});
