import { test, expect, type Page } from "playwright/test";
import { readFileSync } from "node:fs";

/**
 * Automated accessibility scan (axe-core: WCAG 2.0/2.1 A and AA rules) on the main routes in light and dark.
 * Fails on serious or critical findings. This is a floor, not a guarantee: axe catches roughly a third of real issues, and nobody has tested
 * with a screen reader or on real devices. axe-core is resolved from node_modules (a transitive dependency); the test skips if it is absent.
 */
let axeSource = "";
try {
  axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch {
  /* skipped below */
}

const ROUTES = ["/", "/pricing", "/signin", "/signup", "/help", "/contact", "/security", "/status", "/privacy", "/terms", "/download", "/app", "/about", "/models", "/compare", "/simulation", "/forgot-password", "/changelog", "/enterprise", "/for-students"];
const THEMES = ["light", "dark"] as const;

type Violation = { id: string; impact: string | null; help: string; nodes: { target: unknown[]; failureSummary?: string }[] };

async function scan(page: Page): Promise<Violation[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected above
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map((v: Violation) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target, failureSummary: n.failureSummary })) }));
  });
}

for (const theme of THEMES) {
  for (const route of ROUTES) {
    test(`axe: ${route} (${theme}) has no serious or critical violations`, async ({ page }) => {
      test.skip(!axeSource, "axe-core not installed");
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      if (route === "/app") await page.locator("textarea").first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1200);
      const found = await scan(page);
      const bad = found.filter((v) => v.impact === "serious" || v.impact === "critical");
      const lesser = found.filter((v) => !bad.includes(v)).map((v) => `${v.id}(${v.impact})`);
      if (lesser.length) console.log(`[axe] ${route} ${theme}: lesser findings: ${lesser.join(", ")}`);
      expect(bad.map((v) => ({ id: v.id, impact: v.impact, help: v.help, where: v.nodes.map((n) => JSON.stringify(n.target)).join(" | ") })), `${route} (${theme})`).toEqual([]);
    });
  }
}

test.describe("keyboard: the phone sidebar drawer gives focus back when it closes", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("Escape and picking a view return focus to the menu button, not <body>", async ({ page }) => {
    await page.goto("/app");
    await page.locator("[data-app-ready]").waitFor({ state: "attached", timeout: 30_000 });
    const menu = page.getByRole("button", { name: "Open sidebar" });
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
    await page.keyboard.press("Enter");
    await page.locator("#keplar-sidebar").getByRole("link", { name: /^Projects/ }).focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });
});
