import { test, expect } from "playwright/test";

/**
 * Regression: when the main thread is starved (CPU throttled: frames 1-2 s apart, like a weak GPU or a loaded machine with the 3D canvas),
 * the typing reveal runs on real time, so a long answer finishes in a handful of frames instead of one clamped 100 ms step per frame.
 */
const TEXT = "Use Postgres. It is the safer default for most teams, with a mature ecosystem and strong consistency guarantees. ".repeat(6).trim();
const answer = {
  id: "ans_slow", markdown: TEXT,
  consensus: { level: "consensus", score: null, agree: 3, disagree: 0, missing: 0, responded: 3, consulted: 3, summary: "3 agree" },
  models: [], sources: [], disagreements: [],
  verification: { mode: "not-needed", summary: "", checks: [], notes: [] },
  reasoning: "", capabilities: [], compute: { units: 1, level: "low" }, durationMs: 1000,
};

test("typing reveal on very slow frames finishes in a few frames", async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.89.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 60_000 });
  await page.route("**/api/keplar", (route) => route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "answer", answer }) + "\n" }));
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number; __f0: number; __f1: number };
    w.__frames = 0; w.__f0 = 0; w.__f1 = 0;
    const loop = () => { w.__frames++; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    new MutationObserver(() => {
      const a = [...document.querySelectorAll("article")].pop();
      if (!a) return;
      const t = a.innerText;
      if (!w.__f0 && /Use Postgres/.test(t)) w.__f0 = w.__frames;
      if (!w.__f1 && (t.match(/Use Postgres\./g) || []).length >= 6) w.__f1 = w.__frames;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.locator("textarea:visible").first().fill("pg or mysql?");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 60 });
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  await page.waitForFunction(() => (window as unknown as { __f1: number }).__f1 > 0, null, { timeout: 150_000, polling: 500 });
  const { f0, f1 } = await page.evaluate(() => { const w = window as unknown as { __f0: number; __f1: number }; return { f0: w.__f0, f1: w.__f1 }; });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  console.log(`reveal frames: ${f1 - f0}`);
  expect(f1 - f0, `reveal took ${f1 - f0} frames`).toBeLessThanOrEqual(8);
});
