import { test, expect, type Page } from "playwright/test";
import { execFileSync } from "node:child_process";
import { DATA_DIR, SECRET } from "./playwright.config";

/**
 * Team workspaces (beta) in a real browser: the owner creates a team, saves a DRAFT invite (nothing is mailed), copies the one-time link,
 * a second account opens it and joins, switches into the team from the account menu, then the owner removes them and their very next
 * request to the team is refused. Also: a 390px phone shows the panel with no sideways scroll.
 */
let hop = 0;
const origin = () => `http://localhost:${process.env.E2E_PORT || 3199}`;
const run = (script: string, ...args: string[]) =>
  execFileSync("node", ["--import", "tsx", `e2e/${script}`, ...args], { cwd: process.cwd(), env: { ...process.env, KEPLAR_DATA_DIR: DATA_DIR, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: origin(), KEPLAR_DEV_TOOLS: "1" }, stdio: "pipe" });

async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: origin(), "x-forwarded-for": `10.91.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  // The email for THIS address (the outbox lists everyone's, and delivery can trail the response by a moment).
  let link = "";
  for (let i = 0; i < 40 && !link; i++) {
    const html = await (await ctx.request.get("/dev/outbox")).text();
    const at = html.indexOf(email);
    if (at >= 0) link = [...html.slice(at).matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0] ?? "";
    if (!link) await new Promise((r) => setTimeout(r, 250));
  }
  expect(link).not.toBe("");
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
  await ctx.request.get("/api/compute"); // creates the workspace row
}

const openTeamTab = async (page: Page) => {
  await page.goto("/account");
  await page.getByRole("tab", { name: /^advanced$/i }).click(); // Team workspace lives in Settings > Advanced
  await expect(page.locator("[data-team-panel]")).toBeVisible();
};

test("owner drafts an invite (nothing mailed), a second account joins by the one-time link, works in the team, and loses access the moment they are removed", async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const ownerMail = `owner-${stamp}@example.com`;
  const guestMail = `guest-${stamp}@example.com`;
  const ownerCtx = await browser.newContext({ reducedMotion: "reduce" });
  const guestCtx = await browser.newContext({ reducedMotion: "reduce" });
  const owner = await ownerCtx.newPage();
  const guest = await guestCtx.newPage();
  await signIn(owner, ownerMail);
  run("set-plan.ts", ownerMail, "business");
  await signIn(guest, guestMail);

  // Owner: create the team.
  await openTeamTab(owner);
  await expect(owner.getByText(/shared pool of 13,500 credits/i)).toBeVisible();
  await owner.getByLabel("Name your team").fill("Acme E2E");
  await owner.getByRole("button", { name: "Create team" }).click();
  await expect(owner.getByRole("heading", { name: /Acme E2E/ })).toBeVisible();

  // Draft: saved, not sent.
  await owner.getByLabel("Email address").fill(guestMail);
  await owner.getByLabel("Role", { exact: true }).selectOption("member");
  await owner.getByRole("button", { name: "Save draft" }).click();
  const row = owner.locator(`[data-invite-row="${guestMail}"]`);
  await expect(row).toContainText("Draft, not sent");
  const outboxBefore = await (await owner.context().request.get("/dev/outbox")).text();
  expect(outboxBefore).not.toContain("invited you to");
  // Email isn't configured in this environment: pressing Send says so, and still sends nothing.
  await row.getByRole("button", { name: "Send email" }).click();
  await expect(owner.getByText(/Email isn't set up on this server, so nothing was sent/)).toBeVisible();
  expect(await (await owner.context().request.get("/dev/outbox")).text()).not.toContain("invited you to");

  // Copy link: shown once, in the fragment.
  await row.getByRole("button", { name: "Copy link" }).click();
  const link = await row.getByLabel(/One-time link/).inputValue();
  expect(link).toMatch(/\/team\/join#[\w-]{40,}/);

  // Guest: opens the link, sees who asks, joins.
  await guest.goto(link);
  await expect(guest.getByText(/Acme E2E/).first()).toBeVisible();
  expect(guest.url()).not.toContain("#"); // the token left the address bar
  const accepted = guest.waitForResponse((r) => r.url().includes("/api/team/join") && (r.request().postData() ?? "").includes("accept"), { timeout: 30_000 });
  await guest.getByRole("button", { name: "Join the team" }).click();
  expect((await accepted).status()).toBe(200);
  await expect(guest.getByText(/You joined Acme E2E/)).toBeVisible({ timeout: 15_000 });
  // The link is single use.
  const again = await guest.context().request.post("/api/team/join", { headers: { "content-type": "application/json", origin: origin() }, data: { token: link.split("#")[1], action: "preview" } });
  expect(again.status()).toBe(404);

  // Guest: the account menu lists the workspaces and shows the team as active.
  await guest.goto("/app");
  await guest.waitForSelector("[data-account-menu]", { timeout: 30_000 });
  await expect(guest.locator("[data-team-active]")).toContainText("Acme E2E");
  expect((await guest.context().request.get("/api/projects")).status()).toBe(200);
  await guest.getByRole("button", { name: /^Account:/ }).click();
  await expect(guest.getByRole("menuitemradio", { name: /Personal/ })).toBeVisible();

  // Owner removes the guest. Their very next request to the team is refused.
  await openTeamTab(owner);
  owner.once("dialog", (d) => void d.accept()); // "Remove … They lose access right away."
  await owner.locator(`[data-member="${guestMail}"]`).getByRole("button", { name: "Remove" }).click();
  await expect(owner.locator(`[data-member="${guestMail}"]`)).toHaveCount(0);
  const after = await guest.context().request.get("/api/projects");
  expect(after.status()).toBe(403);
  expect((await after.json()).code).toBe("team_access_revoked");
  // And the audit log shows it.
  await expect(owner.getByText(/removed guest-/)).toBeVisible();
  await ownerCtx.close(); // pages left open keep animating and starve the next test of CPU
  await guestCtx.close();
});

test("a Free account sees the honest Business-only message and cannot create a team", async ({ browser }) => {
  const freeCtx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await freeCtx.newPage();
  await signIn(page, `free-${Date.now().toString(36)}@example.com`);
  await openTeamTab(page);
  await expect(page.locator("[data-team-ineligible]")).toContainText(/start on the Business plan/);
  await expect(page.getByRole("button", { name: "Create team" })).toHaveCount(0);
  const r = await page.context().request.post("/api/team", { headers: { "content-type": "application/json", origin: origin() }, data: { name: "Nope" } });
  expect(r.status()).toBe(402);
  await freeCtx.close();
});

test("phone: the team panel fits 390px with no sideways scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const mail = `phone-${Date.now().toString(36)}@example.com`;
  await signIn(page, mail);
  run("set-plan.ts", mail, "business");
  await openTeamTab(page);
  await page.getByLabel("Name your team").fill("Phone team");
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByRole("heading", { name: /Phone team/ })).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
  await ctx.close();
});
