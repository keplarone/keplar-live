import { test, expect, type Page, type BrowserContext } from "playwright/test";

/**
 * Deleting chats, signed in with a real (local) account: row menu and open-chat header with an inline confirm (never a browser
 * alert), optimistic removal with Undo, then a permanent delete on the server; deleting the open chat opens a new chat; Settings
 * "Delete all chats" needs the word DELETE; button text fits at phone width.
 */
const stamp = Date.now().toString(36);
const EMAIL = `del.${stamp}@example.com`;
const T = { a: `Alpha plan ${stamp}`, b: `Bravo plan ${stamp}`, c: `Charlie plan ${stamp}`, d: `Delta plan ${stamp}` };
const ID = { a: `e2e-a-${stamp}`, b: `e2e-b-${stamp}`, c: `e2e-c-${stamp}`, d: `e2e-d-${stamp}` };

async function signIn(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.91.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/signin?next=%2Fapp");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href: string | null = null;
  await expect(async () => {
    await page.goto("/dev/outbox");
    const all = await page.locator("a[href*='/signin/verify']").evaluateAll((as, em) => as.filter((a) => (a.parentElement?.parentElement?.textContent ?? "").includes(`to ${em}`)).map((a) => (a as HTMLAnchorElement).href), email); // this address's mail only
    href = all[0] ?? null;
    expect(href).toBeTruthy();
  }).toPass({ timeout: 30_000 });
  await page.goto(href!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(app|welcome)/, { timeout: 30_000 });
}
const seed = async (ctx: BrowserContext, id: string, title: string) => {
  const r = await ctx.request.put(`/api/chats/${id}`, { data: { title, messages: [{ id: `u-${id}`, role: "user", text: `hello from ${title}`, attachments: [], modes: {}, createdAt: Date.now() }] } });
  expect(r.status()).toBe(200);
};
const status = async (ctx: BrowserContext, id: string) => (await ctx.request.get(`/api/chats/${id}`)).status();
const listed = async (ctx: BrowserContext) => ((await (await ctx.request.get("/api/chats")).json()) as { chats: { id: string }[] }).chats.map((c) => c.id);
async function toApp(page: Page) {
  await page.goto("/app");
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
}
/** The sidebar Recents list is open by default but can be folded (remembered per account): make sure it is open. */
async function openRecents(page: Page) {
  const t = page.locator("[data-recents-toggle]").first();
  await t.waitFor({ timeout: 30_000 });
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await expect(t).toHaveAttribute("aria-expanded", "true");
}
const row = (page: Page, title: string) => page.locator("li", { has: page.getByRole("button", { name: title, exact: true }) });
/** No button inside `scope` clips or overflows its own text. */
async function textFits(page: Page, scope: string) {
  const bad = await page.locator(`${scope} button`).evaluateAll((bs) =>
    bs.filter((b) => (b as HTMLElement).offsetParent !== null && (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1)).map((b) => b.textContent));
  expect(bad, `buttons with clipped text in ${scope}`).toEqual([]);
}

test.describe.serial("delete chat", () => {
  let ctx: BrowserContext;
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    page.on("dialog", async (d) => { await d.dismiss(); throw new Error(`browser dialog used: ${d.message()}`); });
    await signIn(page, EMAIL);
    for (const k of ["a", "b", "c", "d"] as const) await seed(ctx, ID[k], T[k]);
  });
  test.afterAll(async () => { await ctx.close(); });

  test("row delete asks inline, Cancel keeps it, Undo brings it back and nothing is deleted on the server", async () => {
    // The saved list loads right after the page does; on a brand-new account the very first load can beat it, so reload once if it is not there.
    await expect(async () => {
      await toApp(page);
      await openRecents(page);
      await expect(row(page, T.a)).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 40_000 });
    await row(page, T.a).hover();
    await row(page, T.a).getByRole("button", { name: /^Delete chat/ }).click();
    await expect(page.locator("[data-delete-confirm]")).toContainText("Delete this chat?");
    await textFits(page, "[data-delete-confirm]");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("[data-delete-confirm]")).toHaveCount(0);
    await expect(row(page, T.a)).toBeVisible();

    await row(page, T.a).hover();
    await row(page, T.a).getByRole("button", { name: /^Delete chat/ }).click();
    await page.locator("[data-delete-yes]").click();
    await expect(page.getByRole("button", { name: T.a, exact: true })).toHaveCount(0); // gone at once
    const toast = page.getByRole("list", { name: "Notifications" }).getByRole("listitem").filter({ hasText: "Deleted" });
    await expect(toast).toContainText("Deleted");
    await textFits(page, 'ol[aria-label="Notifications"] > li');
    expect(await status(ctx, ID.a)).toBe(200); // still safe on the server during the undo window
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: T.a, exact: true })).toBeVisible();
    await expect(toast).toHaveCount(0);
    await page.waitForTimeout(7500); // longer than the undo window
    expect(await status(ctx, ID.a)).toBe(200);
  });

  test("without Undo the chat is deleted for good after the window", async () => {
    await row(page, T.b).hover();
    await row(page, T.b).getByRole("button", { name: /^Delete chat/ }).click();
    await page.locator("[data-delete-yes]").click();
    await expect(page.getByRole("button", { name: T.b, exact: true })).toHaveCount(0);
    expect(await status(ctx, ID.b)).toBe(200);
    await expect.poll(() => status(ctx, ID.b), { timeout: 15_000 }).toBe(404);
    await expect(page.getByRole("list", { name: "Notifications" }).getByRole("listitem").filter({ hasText: "Deleted" })).toHaveCount(0);
    expect(await listed(ctx)).not.toContain(ID.b);
    expect(await listed(ctx)).toEqual(expect.arrayContaining([ID.a, ID.c, ID.d]));
    await page.reload();
    await page.locator("textarea").first().waitFor();
    await expect(page.getByRole("button", { name: T.b, exact: true })).toHaveCount(0);
  });

  test("the open chat can be deleted from its header and a new chat opens", async () => {
    await page.getByRole("button", { name: T.c, exact: true }).click();
    await expect(page.locator("header p", { hasText: T.c })).toBeVisible();
    await expect(page.getByText(`hello from ${T.c}`).first()).toBeVisible({ timeout: 15_000 });
    await page.locator("header").getByRole("button", { name: /^Delete chat/ }).click();
    await textFits(page, "header [data-delete-confirm]");
    await page.keyboard.press("Escape"); // Escape cancels
    await expect(page.locator("[data-delete-confirm]")).toHaveCount(0);
    await page.locator("header").getByRole("button", { name: /^Delete chat/ }).click();
    await page.locator("header [data-delete-yes]").click();
    await expect(page.getByRole("heading", { level: 1, name: /^(Welcome|Good (morning|afternoon|evening))/ })).toBeVisible(); // a new chat (the empty-chat greeting)
    await expect(page.locator("header p", { hasText: "New chat" })).toHaveCount(1); // the empty chat keeps its title out of sight (App.module.css)
    await expect(page.getByRole("button", { name: T.c, exact: true })).toHaveCount(0);
    await expect.poll(() => status(ctx, ID.c), { timeout: 15_000 }).toBe(404);
  });

  test("History rows confirm inline too", async () => {
    const hist = page.locator('nav[aria-label="Keplar"] [data-nav="history"]').first();
    if (!(await hist.isVisible())) await page.locator("[data-more]").first().click(); // All chats (History) sits under "More"
    await hist.click();
    await expect(page.getByRole("heading", { name: "All chats" })).toBeVisible();
    const trigger = page.locator(`[data-delete-for="${ID.d}"]`); // the History row's trash button
    await trigger.click();
    await expect(page.locator("[data-delete-confirm]")).toContainText("Delete this chat?");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.locator("[data-delete-yes]").click();
    await expect(page.getByText(T.d, { exact: true })).toHaveCount(0);
    await page.getByRole("list", { name: "Notifications" }).getByRole("listitem").filter({ hasText: "Deleted" }).getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText(T.d, { exact: true }).first()).toBeVisible();
    expect(await status(ctx, ID.d)).toBe(200);
  });

  test("text fits its buttons at phone width (340px)", async () => {
    await page.setViewportSize({ width: 340, height: 900 });
    await toApp(page);
    await page.getByRole("button", { name: "Open sidebar" }).click();
    await openRecents(page);
    const link = page.locator("#keplar-sidebar").getByRole("button", { name: T.a, exact: true });
    await link.locator("xpath=..").getByRole("button", { name: /^Delete chat/ }).click();
    await textFits(page, "#keplar-sidebar [data-delete-confirm]");
    const box = await page.locator("#keplar-sidebar [data-delete-confirm]").boundingBox();
    const side = await page.locator("#keplar-sidebar").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(side!.x + side!.width + 1);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("Settings: Delete all chats needs the typed word and removes only this account's chats", async () => {
    await seed(ctx, `e2e-x-${stamp}`, `Xray ${stamp}`);
    await page.goto("/account#data");
    await page.getByRole("button", { name: "Delete all chats" }).click();
    const go = page.locator("form").getByRole("button", { name: "Delete all chats" });
    await expect(go).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("delete");
    await expect(go).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await expect(go).toBeEnabled();
    await textFits(page, "form");
    await go.click();
    await expect(page.locator("[data-delete-all-done]")).toContainText(/Deleted \d+ chats?\./);
    expect(await listed(ctx)).toEqual([]);
    await toApp(page);
    await openRecents(page);
    await expect(page.getByRole("button", { name: T.a, exact: true })).toHaveCount(0);
    await expect(page.getByText("Your chats will appear here.")).toBeVisible();
  });
});
