import { test, expect, type Page, type BrowserContext } from "playwright/test";

/**
 * Chat titles say what the chat is about, never the raw message: instant topic title for a new chat, a free-model refinement for plain topics only,
 * old chats that still carry their first message get a topic title when opened, renamed chats are left alone, and Delete still works.
 */
const stamp = Date.now().toString(36);
const EMAIL = `titles.${stamp}@example.com`;

async function signIn(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.94.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
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
const seed = async (ctx: BrowserContext, id: string, title: string, text: string) => {
  const r = await ctx.request.put(`/api/chats/${id}`, { data: { title, messages: [{ id: `u-${id}`, role: "user", text, attachments: [], modes: {}, createdAt: Date.now() }] } });
  expect(r.status()).toBe(200);
};
const serverTitle = async (ctx: BrowserContext, id: string) => {
  const j = (await (await ctx.request.get("/api/chats")).json()) as { chats: { id: string; title: string }[] };
  return j.chats.find((c) => c.id === id)?.title ?? null;
};
/** The sidebar Recents list is open by default but can be folded (remembered per account): make sure it is open. */
async function openRecents(page: Page) {
  const t = page.locator("[data-recents-toggle]").first();
  await t.waitFor({ timeout: 30_000 });
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await expect(t).toHaveAttribute("aria-expanded", "true");
}
const side = (page: Page) => page.locator("#keplar-sidebar, nav[aria-label='Keplar']").first();

test.describe.serial("chat titles", () => {
  let ctx: BrowserContext;
  let page: Page;
  const titleCalls: string[] = [];
  const L1 = `e2e-t1-${stamp}`;
  const L2 = `e2e-t2-${stamp}`;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    page.on("dialog", (d) => void d.dismiss());
    await signIn(page, EMAIL);
    await seed(ctx, L1, "fuck you", "fuck you");
    await seed(ctx, L2, "My roadmap", "what is my name");
    await page.route("**/api/chat-title", async (route) => {
      const q = (JSON.parse(route.request().postData() ?? "{}") as { question?: string }).question ?? "";
      titleCalls.push(q);
      await route.fulfill({ json: { title: "Python CSV parsing", source: "model" } });
    });
  });
  test.afterAll(async () => { await ctx.close(); });

  test("an old chat that still carries its first message gets a neutral title when opened; a renamed one is untouched", async () => {
    await expect(async () => {
      await page.goto("/app");
      await openRecents(page);
      await expect(side(page).getByRole("button", { name: "fuck you", exact: true })).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 40_000 });
    await side(page).getByRole("button", { name: "fuck you", exact: true }).click();
    await expect(side(page).getByRole("button", { name: "Casual chat", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(side(page).getByText("fuck you")).toHaveCount(0);
    await expect.poll(() => serverTitle(ctx, L1), { timeout: 15_000 }).toBe("Casual chat"); // saved for the account, not just on screen
    await side(page).getByRole("button", { name: "My roadmap", exact: true }).click();
    await page.waitForTimeout(2500);
    await expect(side(page).getByRole("button", { name: "My roadmap", exact: true })).toBeVisible();
    expect(await serverTitle(ctx, L2)).toBe("My roadmap");
    expect(titleCalls).toEqual([]); // sensitive text never goes to the title model
  });

  test("new chats: a topic gets an instant title then the model's; sensitive and guard questions get fixed titles with no model call", async () => {
    await page.getByRole("button", { name: /new thread/i }).first().click();
    await page.locator("textarea:visible").first().fill("How do I parse a CSV in Python?");
    await page.getByRole("button", { name: /^Ask Keplar/ }).click();
    await expect(side(page).getByRole("button", { name: "Python CSV parsing", exact: true })).toBeVisible({ timeout: 60_000 });
    expect(titleCalls).toEqual(["How do I parse a CSV in Python?"]);
    await expect(side(page).getByText("How do I parse a CSV in Python?")).toHaveCount(0);

    await page.getByRole("button", { name: /new thread/i }).first().click();
    await page.locator("textarea:visible").first().fill("Are you conscious?");
    await page.getByRole("button", { name: /^Ask Keplar/ }).click();
    await expect(side(page).getByRole("button", { name: "About Keplar", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(side(page).getByText("Are you conscious?")).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(titleCalls.length).toBe(1);
  });

  test("Delete still works on a topic-titled chat, with Undo", async () => {
    const row = side(page).locator("li", { has: page.getByRole("button", { name: "About Keplar", exact: true }) }).first();
    await row.hover();
    await row.getByRole("button", { name: /^Delete chat/ }).click();
    await page.locator("[data-delete-yes]").click();
    await expect(side(page).getByRole("button", { name: "About Keplar", exact: true })).toHaveCount(0);
    await page.locator("[data-undo-toast]").getByRole("button", { name: "Undo" }).click();
    await expect(side(page).getByRole("button", { name: "About Keplar", exact: true })).toBeVisible();
    const row2 = side(page).locator("li", { has: page.getByRole("button", { name: "Casual chat", exact: true }) }).first();
    await row2.hover();
    await row2.getByRole("button", { name: /^Delete chat/ }).click();
    await page.locator("[data-delete-yes]").click();
    await expect(side(page).getByRole("button", { name: "Casual chat", exact: true })).toHaveCount(0);
    await expect.poll(async () => (await ctx.request.get(`/api/chats/${L1}`)).status(), { timeout: 15_000 }).toBe(404);
  });
});
