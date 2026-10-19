import { test, expect, type Page } from "playwright/test";
import { readFileSync } from "node:fs";

/** Keplar Command Center (/admin/command): admin only, every section renders, unmeasured data says "Unavailable", accessible. */
let axeSource = "";
try { axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"); } catch { /* skipped below */ }

const ADMIN = "team@keplar.one"; // the default admin address (KEPLAR_ADMIN_EMAILS unset in the e2e server)

async function signIn(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.92.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/signin?next=%2Fapp");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href: string | null = null;
  await expect(async () => {
    await page.goto("/dev/outbox");
    const all = await page.locator("a[href*='/signin/verify']").evaluateAll((as, em) => as.filter((a) => (a.parentElement?.parentElement?.textContent ?? "").includes(`to ${em}`)).map((a) => (a as HTMLAnchorElement).href), email);
    href = all[0] ?? null;
    expect(href).toBeTruthy();
  }).toPass({ timeout: 30_000 });
  await page.goto(href!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 30_000 });
}

const act = (page: Page, data: Record<string, unknown>) => page.request.post("/api/admin/growth-ops", { data, headers: { origin: new URL(page.url()).origin } });

test("a signed-in non-admin gets 404 for the Command Center and its API", async ({ page }) => {
  await signIn(page, `cc-user-${Date.now()}@example.com`);
  expect((await page.goto("/admin/command"))!.status()).toBe(404);
  expect((await act(page, { action: "pause" })).status()).toBe(404);
});

test("the admin sees every section, real job results, Unavailable where nothing was measured; screenshots and axe", async ({ page }) => {
  await signIn(page, ADMIN);
  // Seed through the real admin API: two jobs that read only Keplar's own data, and one draft.
  for (const job of ["revenue-snapshot", "usage-retention", "weekly-report"]) expect((await act(page, { action: "run", job })).status()).toBe(200);
  expect((await act(page, { action: "content.create", draft: { channel: "blog", title: "How Keplar compares answers", body: "Draft body.", claims: [{ text: "Keplar asks several models", source: "https://keplar.one/how-it-works" }, { text: "An unsourced claim" }] } })).status()).toBe(200);

  for (const vp of [{ name: "desktop", width: 1440, height: 1000 }, { name: "phone", width: 390, height: 844 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const res = await page.goto("/admin/command");
    expect(res!.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Keplar Command Center" })).toBeVisible();
    for (const h of ["Leaderboard Intelligence", "AI Visibility", "Competitive Intelligence", "Growth Analytics", "Financial Performance", "SEO health", "Content Operations", "Experimentation", "Automation Center"]) {
      await expect(page.getByRole("heading", { name: h })).toBeVisible();
    }
    await expect(page.getByText("Unavailable").first()).toBeVisible();
    await expect(page.getByText(/Source: growth_sub_daily/).first()).toBeVisible();
    await expect(page.getByText("Artificial Analysis").first()).toBeVisible();
    await expect(page.getByText("How Keplar compares answers").first()).toBeVisible();
    await expect(page.getByText("1 of 2").first()).toBeVisible();
    // The page itself never scrolls sideways (wide tables scroll inside their panel).
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/command-center-${vp.name}.png`, fullPage: vp.name === "desktop" });
  }

  if (axeSource) {
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.addScriptTag({ content: axeSource });
      const bad = await page.evaluate(async () => {
        // @ts-expect-error axe is injected above
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
        return r.violations.filter((v: { impact: string }) => v.impact === "serious" || v.impact === "critical").map((v: { id: string; nodes: { target: unknown[] }[] }) => `${v.id} @ ${v.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)).join(" | ")}`);
      });
      if (bad.length) console.log(`[axe] command center ${theme}:\n${bad.join("\n")}`);
      expect(bad, theme).toEqual([]);
    }
  }
});
