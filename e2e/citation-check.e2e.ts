import { test, expect, type Page } from "playwright/test";
import { readFileSync } from "node:fs";

/** Deep Research's citation check: the header counts and the "Citation check" list of statements a cited page didn't clearly back. Mocked reply. */
let axeSource = "";
try { axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"); } catch { /* skipped below */ }

const src = (n: number, title: string, host: string, snippet: string) => ({ n, title, url: `https://${host}/page`, host, query: 0, snippet });
const answer = {
  id: "ans_cite1",
  markdown: "The Eiffel Tower was completed in March 1889 [1]. It was designed and built by Gustave Eiffel's company [2]. It is about 300 metres tall [3].",
  consensus: { level: "consensus", score: null, agree: 2, disagree: 0, missing: 0, responded: 2, consulted: 2, summary: "2 of 2 agree" },
  models: [], sources: [], disagreements: [],
  verification: { mode: "cross-model", summary: "Reviewed.", reviewer: "Reviewer One", checks: [], notes: [] },
  reasoning: "", capabilities: [], compute: { units: 40, level: "medium" }, durationMs: 21000,
  research: {
    queries: ["eiffel tower completion", "eiffel tower height"],
    sources: [src(1, "Eiffel Tower history", "history.example.org", "The tower was completed in March 1889."), src(2, "Gustave Eiffel", "bio.example.com", "Eiffel's company designed and built it."), src(3, "Tower facts", "facts.example.net", "The tower is 330 metres tall today.")],
    cited: [1, 2, 3],
    check: {
      summary: { claims: 3, supported: 2, partiallySupported: 0, notVerified: 1 },
      claims: [{ text: "It is about 300 metres tall.", citations: [3], status: "not-verified", quote: "The tower is 330 metres tall today.", note: "The figure 300 wasn't in what was read from the cited page." }],
    },
  },
};

async function ask(page: Page) {
  await page.route("**/api/keplar", (route) => route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "answer", answer }) + "\n" }));
  const send = page.getByRole("button", { name: /^Ask Keplar/ });
  // On a cold server the composer can re-render while starting up and drop a fill (the button goes back to disabled), so fill and send
  // until the answer shows. The reply is mocked, so a repeated send is harmless.
  await expect(async () => {
    await page.locator("textarea:visible").first().fill("Research when the Eiffel Tower was completed and how tall it is.");
    await send.click({ timeout: 2000 });
    await expect(page.locator("[data-citation-check]").first()).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 60_000 });
}

for (const viewport of [{ name: "desktop", width: 1280, height: 900 }, { name: "phone", width: 390, height: 844 }]) {
  test(`citation check (${viewport.name}): counts in the header, flagged statement with the closest line read`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.86.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
    await page.goto("/app");
    await page.locator("textarea").first().waitFor({ timeout: 30_000 });
    await ask(page);
    await expect(page.locator("[data-citation-check]")).toHaveText("Citations: 2 supported · 1 not verified", { timeout: 30_000 });
    const list = page.locator("[data-research-checks]");
    await expect(list).toContainText("1 statement needs a closer look");
    const summary = list.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(list).toHaveAttribute("open", "");
    await expect(list).toContainText("Not verified");
    await expect(list).toContainText("It is about 300 metres tall.");
    await expect(list).toContainText("The figure 300 wasn't in what was read");
    await expect(list).toContainText("Closest line read: “The tower is 330 metres tall today.”");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await list.scrollIntoViewIfNeeded();
    await page.locator("article").last().screenshot({ path: `test-results/citation-check-${viewport.name}.png` });
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`citation check (${theme}): no serious or critical axe findings in the answer`, async ({ page }) => {
    test.skip(!axeSource, "axe-core not installed");
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.87.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
    await page.goto("/app");
    await page.locator("textarea").first().waitFor({ timeout: 30_000 });
    await ask(page);
    const list = page.locator("[data-research-checks]");
    await expect(list).toBeVisible({ timeout: 30_000 });
    // Set after hydration (the app applies its stored theme on load), then confirmed, so each run really scans its theme.
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await list.locator("summary").click();
    await page.addScriptTag({ content: axeSource });
    const bad = await page.evaluate(async () => {
      // @ts-expect-error axe is injected above
      const r = await window.axe.run(document.querySelector("article:last-of-type") ?? document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
      return r.violations.filter((v: { impact: string }) => v.impact === "serious" || v.impact === "critical").map((v: { id: string; help: string; nodes: { target: unknown[] }[] }) => `${v.id}: ${v.help} @ ${v.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)).join(" | ")}`);
    });
    if (bad.length) console.log(`[axe] ${theme}: ${bad.join("\n")}`);
    expect(bad).toEqual([]);
    await page.locator("article").last().screenshot({ path: `test-results/citation-check-${theme}.png` });
  });
}
