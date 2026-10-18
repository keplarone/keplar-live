import { test, expect, type Page } from "playwright/test";

import { execFileSync } from "node:child_process";
import { DATA_DIR, SECRET } from "./playwright.config";

/**
 * Create image in normal chat (/app), in a real browser against the production build.
 * Free-plan gating is the REAL server. The Plus flows mock /api/images* (the production server never talks to a fake Higgsfield):
 * they check what the chat shows and sends - cost first, approval for costly ones, result inline, Download original, Regenerate,
 * Variation, Edit, a reference image with the rights note - not Higgsfield itself (that is covered by tests/chat-image.test.ts).
 */
const run = (script: string, ...args: string[]) =>
  execFileSync("node", ["--import", "tsx", `e2e/${script}`, ...args], { cwd: process.cwd(), env: { ...process.env, KEPLAR_DATA_DIR: DATA_DIR, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3199", KEPLAR_DEV_TOOLS: "1" }, stdio: "pipe" });

const STAMP = Date.now().toString(36);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function signIn(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.77.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/signin?next=%2Fapp");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href: string | null = null;
  await expect(async () => {
    await page.goto("/dev/outbox");
    const all = await page.locator("a[href*='/signin/verify']").evaluateAll((as, to) => as.filter((a) => (a.closest("div[class*='mail']")?.textContent ?? "").includes(`to ${to} `)).map((a) => (a as HTMLAnchorElement).href), email);
    href = all[0] ?? null;
    expect(href).toBeTruthy();
  }).toPass({ timeout: 30_000 });
  await page.goto(href!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(app|welcome)/, { timeout: 30_000 });
  await page.request.get("/api/compute");
}

async function openChat(page: Page) {
  await page.goto("/app");
  await page.waitForSelector("[data-account-menu]", { timeout: 30_000 });
}

const ask = async (page: Page, text: string) => {
  const box = page.locator("textarea").first();
  await box.fill(text);
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
};

/** Mocked /api/images*: cost quote, job start, polling, file. `units` is what the quote says for a plain picture. */
async function mockImages(page: Page, opts: { units?: number; refUnits?: number } = {}) {
  const seen = { estimates: [] as Record<string, unknown>[], starts: [] as Record<string, unknown>[], keplar: 0 };
  const jobs = new Map<string, { polls: number; prompt: string; version: number; size: string }>();
  let n = 0;
  await page.route(/\/api\/keplar$/, (route) => { seen.keplar++; return route.fallback(); });
  await page.route(/\/api\/images\/estimate$/, async (route) => {
    const b = route.request().postDataJSON() as Record<string, unknown>;
    seen.estimates.push(b);
    const units = Number(b.referenceCount) > 0 ? opts.refUnits ?? 42 : opts.units ?? 9;
    await route.fulfill({ json: { estimate: { units, quality: "high", size: b.size ?? "1536x1024" }, usage: { today: 3, perDay: 15 } } });
  });
  await page.route(/\/api\/images$/, async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { config: { available: true }, images: [] } });
    const b = route.request().postDataJSON() as Record<string, unknown>;
    seen.starts.push(b);
    const id = `img_e2e${++n}`;
    jobs.set(id, { polls: 0, prompt: String(b.prompt), version: b.regenerateOf ? 2 : 1, size: String(b.size) });
    await route.fulfill({ status: 202, json: { job: { id, status: "understanding", prompt: b.prompt, size: b.size, quality: b.quality, version: 1, url: null, units: null, error: null, estimateUnits: b.confirmUnits } } });
  });
  await page.route(/\/api\/images\/img_e2e\d+(\?.*)?$/, async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop()!;
    const j = jobs.get(id)!;
    j.polls++;
    const ready = j.polls >= 2;
    await route.fulfill({ json: { job: { id, status: ready ? "ready" : "generating", prompt: j.prompt, size: j.size, quality: "high", version: j.version, url: ready ? `/api/images/${id}/file` : null, units: ready ? 9 : null, error: null, estimateUnits: 9 }, history: [] } });
  });
  await page.route(/\/api\/images\/img_e2e\d+\/file/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route(/\/api\/create\/media\/reference$/, (route) => route.fulfill({ json: { reference: { kind: "image", url: "https://example.test/ref.png", contentType: "image/png", bytes: PNG.length, name: "me.png", token: "t".repeat(64) } } }));
  return seen;
}

test.describe("Create image in chat", () => {
  test("Free plan: a clear 'draw me...' request is not sent to the panel; an upgrade card explains, with a way to ask as text", async ({ page }) => {
    await signIn(page, `ci.free.${STAMP}@example.com`);
    await openChat(page);
    await page.getByRole("button", { name: "Modes" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: /Create image/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    let keplarCalls = 0;
    await page.route(/\/api\/keplar$/, (route) => { keplarCalls++; return route.fallback(); });
    await ask(page, "Draw me an image of a fox in the snow");
    const card = page.getByTestId("chat-image");
    await expect(card.getByTestId("chat-image-blocked")).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("Images are part of Plus and Pro");
    await expect(card.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/pricing");
    expect(keplarCalls).toBe(0);
    // The person can still have it answered as an ordinary question.
    await card.getByRole("button", { name: "Ask as a normal question" }).click();
    await expect(page.getByTestId("chat-image")).toHaveCount(0);
    await expect.poll(() => keplarCalls, { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test("Plus: a cheap picture starts at once with its cost shown, appears inline, and offers Download original, Regenerate, Variation and Edit", async ({ page }) => {
    const mail = `ci.plus.${STAMP}@example.com`;
    await signIn(page, mail);
    run("set-plan.ts", mail, "plus");
    const seen = await mockImages(page);
    await openChat(page);
    await ask(page, "generate an image of a red bicycle at sunset");
    const card = page.getByTestId("chat-image").first();
    const img = card.getByTestId("chat-image-result");
    await expect(img).toBeVisible({ timeout: 20_000 });
    await expect(img).toHaveAttribute("alt", "a red bicycle at sunset");
    await expect(card).toContainText("9 credits");
    expect(seen.keplar).toBe(0);
    expect(seen.starts).toHaveLength(1);
    expect(seen.starts[0]).toMatchObject({ prompt: "a red bicycle at sunset", size: "1536x1024", confirmUnits: 9 });
    expect(String(seen.starts[0].idempotencyKey).length).toBeGreaterThan(8);
    await expect(card.getByRole("link", { name: "Download original" })).toHaveAttribute("href", /\/api\/images\/img_e2e1\/file\?download=1$/);
    // Full-size viewer.
    await card.getByRole("button", { name: "Open the image full size" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    // Regenerate: a new picture of the same image (a new version).
    await card.getByRole("button", { name: "Regenerate" }).click();
    await expect(page.getByTestId("chat-image-result")).toHaveCount(2, { timeout: 20_000 });
    expect(seen.starts[1]).toMatchObject({ regenerateOf: "img_e2e1", confirmUnits: 9 });
    expect(seen.starts[1]).not.toHaveProperty("references");
    // Variation and Edit start from the stored picture, so they carry it as a reference and need the rights tick first.
    await card.getByRole("button", { name: "Variation" }).click();
    const confirm = page.getByTestId("chat-image-confirm").last();
    await expect(confirm).toContainText("42 credits");
    await expect(confirm).toContainText("only if the picture is created");
    const go = confirm.getByRole("button", { name: /Create image · 42 credits/ });
    await expect(go).toBeDisabled();
    await confirm.getByRole("checkbox").check();
    await go.click();
    await expect(page.getByTestId("chat-image-result")).toHaveCount(3, { timeout: 20_000 });
    expect(seen.starts[2]).toMatchObject({ confirmUnits: 42, rightsConfirmed: true });
    expect((seen.starts[2].references as unknown[]).length).toBe(1);
    expect(String(seen.starts[2].prompt)).toMatch(/variation/i);
    await card.getByRole("button", { name: "Edit" }).click();
    await card.getByLabel("What should change?").fill("make it night");
    await card.getByRole("button", { name: "Edit picture" }).click();
    const confirm2 = page.getByTestId("chat-image-confirm").last();
    await confirm2.getByRole("checkbox").check();
    await confirm2.getByRole("button", { name: /Create image/ }).click();
    await expect(page.getByTestId("chat-image-result")).toHaveCount(4, { timeout: 20_000 });
    expect(seen.starts[3]).toMatchObject({ prompt: "make it night" });
  });

  test("Plus: a costly picture asks first with the exact credits and the day's allowance; Cancel starts nothing", async ({ page }) => {
    const mail = `ci.cost.${STAMP}@example.com`;
    await signIn(page, mail);
    run("set-plan.ts", mail, "plus");
    const seen = await mockImages(page, { units: 29 });
    await openChat(page);
    await ask(page, "paint a sunset over the sea, vertical");
    const confirm = page.getByTestId("chat-image-confirm");
    await expect(confirm).toBeVisible({ timeout: 20_000 });
    await expect(confirm.getByTestId("chat-image-cost")).toHaveText("29 credits");
    await expect(confirm).toContainText("You have 12 pictures left today");
    expect(seen.estimates[0]).toMatchObject({ size: "1024x1536" });
    expect(seen.starts).toHaveLength(0);
    await confirm.getByRole("button", { name: "Square" }).click();
    await expect.poll(() => seen.estimates.length).toBeGreaterThan(1);
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("chat-image-canceled")).toContainText("Nothing was charged");
    expect(seen.starts).toHaveLength(0);
  });

  test("Plus: an attached image is the reference (rights note first), and a plain question stays a question", async ({ page }) => {
    const mail = `ci.ref.${STAMP}@example.com`;
    await signIn(page, mail);
    run("set-plan.ts", mail, "plus");
    const seen = await mockImages(page);
    await openChat(page);
    await page.locator("input[type=file]").first().setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText(/me\.png/).first()).toBeVisible();
    await ask(page, "make this photo look like a watercolor");
    const confirm = page.getByTestId("chat-image-confirm");
    await expect(confirm).toBeVisible({ timeout: 20_000 });
    await expect(confirm).toContainText("Create a picture from your image?");
    await expect(confirm).toContainText("42 credits");
    expect(seen.estimates[0]).toMatchObject({ referenceCount: 1 });
    await expect(confirm).toContainText("Only use images you own or have permission to use");
    const go = confirm.getByRole("button", { name: /Create image · 42 credits/ });
    await expect(go).toBeDisabled();
    await confirm.getByRole("checkbox").check();
    await go.click();
    await expect(page.getByTestId("chat-image-result")).toBeVisible({ timeout: 20_000 });
    expect(seen.starts[0]).toMatchObject({ prompt: "make this photo look like a watercolor", confirmUnits: 42, rightsConfirmed: true });
    expect((seen.starts[0].references as { token: string }[])[0].token).toBeTruthy();
    // A plain question goes to the panel, not to the image maker.
    const before = seen.starts.length;
    await ask(page, "How do I generate an image in Python?");
    await expect.poll(() => seen.keplar, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(seen.starts.length).toBe(before);
  });

  test("Modes has no Create image, and / offers chat commands rather than image slash commands", async ({ page }) => {
    const mail = `ci.slash.${STAMP}@example.com`;
    await signIn(page, mail);
    run("set-plan.ts", mail, "plus");
    await openChat(page);
    await page.getByRole("button", { name: "Modes" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: /^Create\b/ })).toBeVisible();
    await expect(page.getByRole("menuitemcheckbox", { name: /Create image/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    const box = page.locator("textarea").first();
    await box.click();
    await box.pressSequentially("/", { delay: 20 });
    const menu = page.getByTestId("slash-command-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("slash-cmd-bts")).toHaveCount(0);
    await expect(menu.getByTestId("slash-cmd-adcreative")).toHaveCount(0);
    await expect(menu.getByTestId("slash-cmd-slides")).toBeVisible();
  });

});
