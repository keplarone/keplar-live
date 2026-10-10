import { test, expect } from "playwright/test";

/**
 * Regression: switching tabs while an answer was still streaming froze the typing reveal for good. The hidden-tab
 * branch revealed what had arrived and then stopped the animation loop, so text that streamed in afterwards was never
 * revealed and the answer sat mid-sentence with "Skip" showing (seen live on keplar.one, 2026-10-05).
 */
const FIRST = "The printing press changed how ideas moved. ";
const REST = "Books became cheaper, literacy spread, and the final sentence arrives after the tab comes back.";
const answer = {
  id: "ans_hidden", markdown: FIRST + REST,
  consensus: { level: "consensus", score: null, agree: 1, disagree: 0, missing: 0, responded: 1, consulted: 1, summary: "1 agree" },
  models: [], sources: [], disagreements: [],
  verification: { mode: "not-needed", summary: "", checks: [], notes: [] },
  reasoning: "", capabilities: [], compute: { units: 1, level: "low" }, durationMs: 1000,
};

test("typing reveal finishes after the tab was hidden mid-stream", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.91.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 60_000 });
  // A stream that sends the first delta, then waits for the test to release the rest (route.fulfill can't stream).
  await page.evaluate(({ first, rest, answer }) => {
    const w = window as unknown as { __release?: () => void };
    const orig = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/keplar")) return orig(input, init);
      const enc = new TextEncoder();
      const line = (o: unknown) => enc.encode(JSON.stringify(o) + "\n");
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(line({ type: "delta", text: first }));
          w.__release = () => { c.enqueue(line({ type: "delta", text: rest })); c.enqueue(line({ type: "answer", answer })); c.close(); };
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } }));
    };
  }, { first: FIRST, rest: REST, answer });
  await page.locator("textarea:visible").first().fill("history of the printing press");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  await expect(page.locator("article[data-typing]")).toContainText("printing press changed", { timeout: 15_000 });
  const setHidden = (hidden: boolean) => page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
  await setHidden(true);
  await page.waitForTimeout(300);
  await setHidden(false);
  await page.waitForTimeout(200);
  await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
  // The rest types out and the card becomes the finished answer (no typing bar left behind).
  await expect(page.locator("article").last()).toContainText("arrives after the tab comes back.", { timeout: 10_000 });
  await expect(page.locator("article[data-typing]")).toHaveCount(0, { timeout: 10_000 });
});
