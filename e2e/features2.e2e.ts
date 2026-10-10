import { test, expect, type Page } from "playwright/test";
import { execFileSync } from "node:child_process";
import { DATA_DIR, SECRET } from "./playwright.config";

/**
 * Saved projects with memory, scheduled agents, referral rewards: real sign-in, real server, nothing mocked except the clock of the world (none).
 * The account is moved to Plus with e2e/set-plan.ts (the throwaway store), like the other paid-plan tests.
 */
const run = (script: string, ...args: string[]) =>
  execFileSync("node", ["--import", "tsx", `e2e/${script}`, ...args], { cwd: process.cwd(), env: { ...process.env, KEPLAR_DATA_DIR: DATA_DIR, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3199", KEPLAR_DEV_TOOLS: "1" }, stdio: "pipe" });
const stamp = Date.now().toString(36);

async function signIn(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.77.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
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
  await page.waitForURL(/\/(app|welcome)/, { timeout: 30_000 });
}

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

test.describe("agents on a schedule", () => {
  for (const [name, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 800 }]] as const) {
    test(`${name}: add a daily brief, edit its schedule, pause, run it, read the history`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      const mail = `agents.${name}.${stamp}@example.com`;
      await signIn(page, mail);
      await page.request.get("/api/compute"); // makes sure the workspace row exists before its plan is changed
      run("set-plan.ts", mail, "plus");
      await page.goto("/app");
      await page.waitForSelector("[data-account-menu]", { state: "attached", timeout: 30_000 });
      if (name === "phone") await page.getByRole("button", { name: "Open sidebar" }).click(); // the sidebar is a drawer on a phone
      await page.getByRole("button", { name: /^Agents$/ }).first().click();
      await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible();
      // The page says how scheduling really works and what is limited.
      await expect(page.getByText(/once a day|every 5 minutes/i).first()).toBeVisible();
      await expect(page.getByText(/You approve anything that leaves Keplar/)).toBeVisible();
      await page.getByLabel("What the agent does").selectOption("daily-brief");
      await page.getByRole("button", { name: "Add agent" }).click();
      const card = page.getByRole("article", { name: /Daily brief/i }).first();
      await expect(card).toBeVisible();
      await expect(card).toContainText("Next run");
      await card.getByRole("button", { name: "Edit schedule" }).click();
      await page.getByLabel("Repeat").selectOption("weekdays");
      await page.getByRole("button", { name: "Save schedule" }).click();
      await expect(page.getByText("Schedule saved.")).toBeVisible();
      await card.getByRole("button", { name: "Pause" }).click();
      await expect(card.getByText("paused", { exact: true })).toBeVisible();
      await card.getByRole("button", { name: "Resume" }).click();
      await card.getByRole("button", { name: "Run now" }).click();
      await expect(page.getByRole("list", { name: "Run history" })).toBeVisible({ timeout: 30_000 });
      await noOverflow(page);
      await ctx.close();
    });
  }

  test("Free: the Agents page says agents are Plus and up and offers no Add button", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page, `agents.free.${stamp}@example.com`);
    await page.goto("/app");
    await page.waitForSelector("[data-account-menu]", { timeout: 30_000 });
    await page.getByRole("button", { name: /^Agents$/ }).first().click();
    await expect(page.getByText(/Scheduled agents are on Plus and up/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add agent" })).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("referrals", () => {
  test("invite link → sign-up note → claim notice for the friend; Account shows the link, the caps and the terms; terms say never cash", async ({ browser }) => {
    const refCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const ref = await refCtx.newPage();
    await signIn(ref, `ref.owner.${stamp}@example.com`);
    const panel = (await (await ref.request.get("/api/referrals")).json()) as { link: string; termsUrl: string };
    expect(panel.link).toMatch(/\/invite\/[a-z0-9]{8}$/);
    await ref.goto("/account");
    await ref.getByRole("tab", { name: /plan & usage/i }).click(); // Invite friends sits in Settings > Plan & usage
    await expect(ref.getByLabel("Your invite link")).toHaveValue(panel.link);
    await expect(ref.getByText(/never cash/i).first()).toBeVisible();
    await expect(ref.getByRole("link", { name: "referral terms" })).toHaveAttribute("href", "/referral-terms");

    const friendCtx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const friend = await friendCtx.newPage();
    const code = panel.link.split("/").pop()!;
    await friend.goto(`/invite/${code}`);
    await expect(friend).toHaveURL(/\/signup\?invited=1/);
    await expect(friend.getByText(/A friend invited you/)).toBeVisible();
    const cookies = await friendCtx.cookies();
    expect(cookies.find((c) => c.name === "kp_ref")?.httpOnly).toBe(true);
    expect(cookies.find((c) => c.name === "kp_ref_p")?.httpOnly).toBe(false);
    await signIn(friend, `ref.friend.${stamp}@example.com`);
    // A brand-new referrer is held for a look (younger than 24 h), so the friend is told it is being checked; never a silent nothing.
    await expect(friend.getByRole("status").filter({ hasText: /Your invite/ })).toBeVisible({ timeout: 30_000 });
    await expect(friend.getByRole("link", { name: "Referral terms" })).toHaveAttribute("href", "/referral-terms");
    await noOverflow(friend);
    await friendCtx.close();
    await refCtx.close();
  });

  test("the terms page is public and says rewards are extra usage credit, never cash", async ({ page }) => {
    await page.goto("/referral-terms");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Referral Terms");
    await expect(page.getByText(/never cash, a payout, a gift card, a coupon/)).toBeVisible();
    await noOverflow(page);
  });
});

test.describe("saved projects with memory", () => {
  test("create a project, open its workspace, add and delete a memory note, export is offered", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const mail = `proj.${stamp}@example.com`;
    await signIn(page, mail);
    await page.request.get("/api/compute");
    run("set-plan.ts", mail, "plus");
    await page.goto("/app");
    await page.waitForSelector("[data-account-menu]", { timeout: 30_000 });
    await page.getByRole("button", { name: /^Projects$/ }).first().click();
    await page.getByPlaceholder("New project name").fill("Launch plan");
    await page.getByRole("button", { name: /Create project/ }).click();
    await page.getByRole("button", { name: /Open the Launch plan workspace/ }).click();
    await page.getByLabel("New project note").fill("Prefers short answers");
    await page.getByRole("button", { name: "Add note" }).click();
    const noteRow = page.locator("#main li", { hasText: "Prefers short answers" });
    await expect(noteRow).toBeVisible();
    await expect(page.getByRole("link", { name: /Export project/ })).toHaveAttribute("href", /\/api\/projects\/.+\/export/);
    await page.getByRole("button", { name: /Delete note: Prefers short answers/ }).click();
    await expect(page.getByText("Note deleted.")).toBeVisible();
    await expect(noteRow).toHaveCount(0);
    await noOverflow(page);
    await ctx.close();
  });
});
