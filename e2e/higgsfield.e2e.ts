import { test, expect, type Page } from "playwright/test";
import { execFileSync } from "node:child_process";
import { DATA_DIR, SECRET } from "./playwright.config";

/**
 * Create > Video (Beta) and Create > Images, in a real browser against the production build.
 * The server runs WITHOUT Higgsfield keys, so the first test is the real "Not configured" state end to end.
 * The configured states are driven with mocked API responses (the production server never talks to a fake Higgsfield):
 * these tests check what the UI shows and sends, not Higgsfield itself.
 */
const run = (script: string, ...args: string[]) =>
  execFileSync("node", ["--import", "tsx", `e2e/${script}`, ...args], { cwd: process.cwd(), env: { ...process.env, KEPLAR_DATA_DIR: DATA_DIR, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3199" }, encoding: "utf8" }).trim();

const EMAIL = `hf.${Date.now().toString(36)}@example.com`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function signIn(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.88.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/signin?next=%2Fapp");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href: string | null = null;
  await expect(async () => {
    await page.goto("/dev/outbox");
    // Only the link in the mail addressed to this account (earlier tests leave older links in the outbox).
    const all = await page.locator("a[href*='/signin/verify']").evaluateAll((as, to) => as.filter((a) => (a.closest("div[class*='mail']")?.textContent ?? "").includes(`to ${to} `)).map((a) => (a as HTMLAnchorElement).href), email);
    href = all[0] ?? null;
    expect(href).toBeTruthy();
  }).toPass({ timeout: 30_000 });
  await page.goto(href!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(app|welcome)/, { timeout: 30_000 });
  await page.request.get("/api/compute"); // creates the account's workspace so a plan can be set
}

async function openCreate(page: Page, tab: RegExp) {
  await page.goto("/app");
  await page.waitForSelector("[data-account-menu]", { timeout: 30_000 });
  await page.locator("#keplar-sidebar").getByRole("link", { name: /^Create$/ }).first().click(); // sidebar tabs are /app/… links since 941a5c1
  await page.getByRole("tab", { name: tab }).click();
}

type M = { id: string; label: string; mode: string; note: string; default: boolean; durations: number[] | null; durationFollowsSource: boolean; aspectRatios: string[]; refs: unknown; options: { resolutions: string[] | null; defaultResolution: string | null; sound: boolean; negativePrompt: boolean; seed: boolean }; price: { known: boolean; label: string } };
const model = (id: string, label: string, mode: string, o: Partial<M> = {}): M => ({
  id, label, mode, note: "", default: false, durations: [4, 5, 6, 8], durationFollowsSource: false, aspectRatios: ["16:9", "9:16", "1:1"], refs: null,
  options: { resolutions: null, defaultResolution: null, sound: false, negativePrompt: false, seed: false }, price: { known: true, label: "from published list price" }, ...o,
});
const SEED_T2V = "hf/bytedance/seedance-2.0/text-to-video";
const SEED_I2V = "hf/bytedance/seedance-2.0/image-to-video";
const K25_T2V = "hf/kling-video/v2.5-turbo/pro/text-to-video";
const MODELS: M[] = [
  model(SEED_T2V, "Seedance 2.0", "text-to-video", { default: true, options: { resolutions: ["480p", "720p", "1080p"], defaultResolution: "720p", sound: true, negativePrompt: false, seed: false } }),
  model(SEED_I2V, "Seedance 2.0", "image-to-video", { aspectRatios: [], refs: { image: { min: 1, max: 1 } }, options: { resolutions: ["480p", "720p", "1080p"], defaultResolution: "720p", sound: true, negativePrompt: false, seed: false } }),
  model(K25_T2V, "Kling 2.5 Turbo Pro", "text-to-video", { durations: [5], aspectRatios: [], options: { resolutions: null, defaultResolution: null, sound: false, negativePrompt: true, seed: false }, price: { known: false, label: "Price TBD" } }),
];
const videoConfig = (over: Record<string, unknown> = {}) => ({
  provider: "higgsfield", configured: true, status: "ready", beta: true, label: "Beta", available: true, upgradeTo: null, message: null,
  defaultModel: SEED_T2V, maxSeconds: 8, compare: { maxModels: 2, perModel: 6, runsPerDay: 2, window: 4 }, limits: { perDay: 6, concurrent: 2, maxCompare: 2, promptChars: 1000, maxOutputs: 2 }, models: MODELS,
  reference: { image: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10_000_000, max: 4 }, video: { types: ["video/mp4"], maxBytes: 100_000_000, minSec: 4, maxSec: 30 }, inlineMaxBytes: 3_000_000, rightsNote: "Only upload images and videos you own or have permission to use." },
  ...over,
});

// Images and Video are no longer Create tabs. The studios stay in the repo; chat video is covered by tests/chat-video.test.ts.
test.describe.skip("Create > Video and image options", () => {
  test("video is Beta and honestly 'Not configured' without Higgsfield keys; nothing can be started", async ({ page }) => {
    await signIn(page, EMAIL.replace("@", "+nc@"));
    run("set-plan.ts", EMAIL.replace("@", "+nc@"), "pro");
    await openCreate(page, /^Video/);
    await expect(page.getByTestId("video-badge")).toHaveText("Not configured");
    await expect(page.getByTestId("video-not-configured")).toContainText("Not configured");
    await expect(page.getByRole("button", { name: /preview and approve/i })).toBeDisabled();
    await expect(page.getByRole("textbox", { name: "Prompt" })).toBeDisabled();
  });

  test("configured: Higgsfield default model, only supported options, live cost, remembered choices, approval", async ({ page }) => {
    await signIn(page, EMAIL.replace("@", "+ok@"));
    run("set-plan.ts", EMAIL.replace("@", "+ok@"), "pro");
    const previews: Record<string, unknown>[] = [];
    await page.route("**/api/create/media/video", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { config: videoConfig(), jobs: [] } });
      return route.fulfill({ status: 202, json: { jobs: [] } });
    });
    await page.route("**/api/create/media/video/preview", async (route) => {
      const b = route.request().postDataJSON() as { models: string[]; durationSec: number; count: number; resolution?: string; references?: unknown[] };
      previews.push(b);
      const per = (b.resolution === "1080p" ? 100 : 77) * b.durationSec;
      const items = b.models.map((id) => {
        const m = MODELS.find((x) => x.id === id)!;
        const tbd = !m.price.known;
        const needsImg = Boolean((m.refs as { image?: { min: number } } | null)?.image?.min);
        return { modelId: id, label: m.label, mode: m.mode, durationSec: b.durationSec, count: b.count ?? 1, applied: [], ignoredOptions: [], usd: 1, units: tbd || needsImg && !b.references?.length ? null : per * (b.count ?? 1), source: "estimate", priceNote: "", usesRefs: { image: needsImg && !!b.references?.length, video: false }, ignoresRefs: Boolean(b.references?.length) && !needsImg, problem: needsImg && !b.references?.length ? "Add a reference image." : null };
      });
      const known = items.every((i) => i.units !== null);
      await route.fulfill({ json: { preview: { items, totalUnits: known ? items.reduce((t, i) => t + (i.units ?? 0), 0) : null, priceKnown: known, large: false, refs: { images: b.references?.length ?? 0, video: false }, rightsNote: "" } } });
    });
    await page.route("**/api/create/media/reference", (route) => route.fulfill({ json: { reference: { kind: "image", url: "https://example.test/ref.png", contentType: "image/png", bytes: PNG.length, name: "ref.png", token: "t".repeat(64) } } }));

    await openCreate(page, /^Video/);
    await expect(page.getByTestId("video-badge")).toHaveText("Beta");
    await expect(page.getByTestId("video-not-configured")).toHaveCount(0);

    // Higgsfield default model is selected and marked.
    const def = page.getByRole("radio", { name: /Seedance 2.0 text to video/ });
    await expect(def).toBeChecked();
    await expect(page.getByText("text to video · default")).toBeVisible();

    // Only options this model supports: shape, length, resolution, outputs, sound; no negative prompt.
    const form = page.getByRole("form", { name: "New video" });
    await expect(form.getByLabel("Shape")).toBeVisible();
    await expect(form.getByLabel("Length")).toBeVisible();
    await expect(form.getByLabel("Resolution")).toBeVisible();
    await expect(form.getByLabel("Outputs")).toBeVisible();
    await expect(form.getByRole("checkbox", { name: /Sound/ })).toBeVisible();
    await expect(form.getByLabel(/Avoid \(negative prompt\)/)).toHaveCount(0);
    await expect(form.getByText("The selected model ignores references").or(form.getByText(/Add a reference image or video by choosing/))).toBeVisible();

    // Live cost follows the options.
    await form.getByRole("textbox", { name: "Prompt" }).fill("A slow push-in on a rainy street at night");
    const quote = page.getByTestId("video-quote");
    await expect(quote).toContainText(/Up to\s*(\d[\d,]*) credits/);
    await form.getByLabel("Length").selectOption("8");
    await expect(quote).toContainText("616 credits");
    await form.getByLabel("Outputs").selectOption("2");
    await expect(quote).toContainText("1,232 credits");
    await form.getByLabel("Resolution").selectOption("1080p");
    await expect(quote).toContainText("1,600 credits");

    // Switching to a model with other options changes what is offered.
    await form.getByRole("radio", { name: /Kling 2.5/ }).check();
    await expect(form.getByLabel(/Avoid \(negative prompt\)/)).toBeVisible();
    await expect(form.getByLabel("Resolution")).toHaveCount(0);
    await expect(form.getByRole("checkbox", { name: /Sound/ })).toHaveCount(0);
    await expect(quote).toContainText(/Price TBD/);
    await expect(page.getByRole("button", { name: /preview and approve/i })).toBeDisabled();

    // Image-to-video: needs an image, then a reference with a preview, a rights note and a remove button.
    await form.getByRole("radio", { name: /Seedance 2.0 image to video/ }).check();
    await expect(page.getByTestId("ref-tag")).toHaveText("needs an image");
    await page.getByTestId("reference-input").setInputFiles({ name: "ref.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("img", { name: "ref.png" })).toBeVisible();
    await expect(form.locator("label", { hasText: "Seedance 2.0 image to video" }).getByTestId("ref-tag")).toHaveText("uses your reference");
    await expect(form.getByText(/permission to use/)).toBeVisible();
    // The cost preview waits for the rights confirmation, then includes the reference.
    await form.getByRole("checkbox", { name: /permission to use/ }).check();
    await expect.poll(() => previews.some((p) => (p.references as unknown[] | undefined)?.length === 1 && p.rightsConfirmed === true)).toBe(true);
    await expect(quote).toContainText(/credits/);

    // Compare: the same reference is shared; a text-only model is clearly marked as ignoring it.
    await form.getByLabel("Compare models").check();
    await page.getByRole("checkbox", { name: /Seedance 2.0 text to video/ }).check();
    await expect(form.locator("label", { hasText: "Seedance 2.0 text to video" }).getByTestId("ref-tag")).toHaveText("ignores your reference");
    await expect(quote).toContainText("ignores your reference");

    // Removing the reference.
    await page.getByRole("button", { name: "Remove ref.png" }).click();
    await expect(page.getByRole("img", { name: "ref.png" })).toHaveCount(0);

    // Approval dialog shows the exact credits before anything starts.
    await page.getByRole("checkbox", { name: /Seedance 2.0 image to video/ }).uncheck();
    await form.getByLabel("Compare models").uncheck();
    await form.getByRole("radio", { name: /Seedance 2.0 text to video/ }).check();
    await expect(quote).toContainText(/credits/);
    await page.getByRole("button", { name: /preview and approve/i }).click();
    await expect(page.getByTestId("video-confirm")).toContainText(/This will use up to .* credits/);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("video-confirm")).toHaveCount(0);

    // Last-used choices are remembered across a reload.
    await page.reload();
    await page.getByRole("button", { name: /^Create$/ }).first().click();
    await page.getByRole("tab", { name: /^Video/ }).click();
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("keplar.video.prefs.v1") ?? "{}"));
    expect(prefs.duration).toBe(8);
    expect(prefs.resolution).toBe("1080p");
    await expect(page.getByRole("form", { name: "New video" }).getByLabel("Length")).toHaveValue("8");
  });

  test("Compare: 6 outputs per model, exact total, Beta note, side-by-side grid, pick some and remove the rest", async ({ page }) => {
    const mail = EMAIL.replace("@", "+cmp@");
    await signIn(page, mail);
    run("set-plan.ts", mail, "business");
    const mk = (id: string, model: string, status: string) => ({ id, prompt: "A fox in snow", model, status, params: { aspectRatio: "16:9", durationSec: 5 }, estimatedUnits: 387, units: status === "completed" ? 387 : null, error: status === "failed" ? "Higgsfield couldn't make this video. Nothing was charged." : undefined, url: status === "completed" ? `/api/create/media/${id}/file` : null, refs: null, compareId: "cmp_1", waiting: status === "queued" });
    const jobs = [mk("a1", SEED_T2V, "completed"), mk("a2", SEED_T2V, "failed"), mk("b1", K25_T2V, "completed"), mk("b2", K25_T2V, "queued")];
    const removed: string[][] = [];
    let blocked = false;
    await page.route("**/api/create/media/video", (route) => route.fulfill({ json: { config: videoConfig(), jobs: jobs.filter((j) => !removed.flat().includes(j.id)) } }));
    await page.route("**/api/create/media/video/remove", async (route) => { const ids = (route.request().postDataJSON() as { ids: string[] }).ids; removed.push(ids); await route.fulfill({ json: { removed: ids, skipped: [] } }); });
    await page.route("**/api/create/media/*/file", (route) => route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]) }));
    await page.route("**/api/create/media/video/preview", async (route) => {
      const b = route.request().postDataJSON() as { models: string[]; count: number; compare?: boolean };
      const items = b.models.map((id) => ({ modelId: id, label: MODELS.find((m) => m.id === id)!.label, mode: "text-to-video", durationSec: 5, count: b.count, applied: [], ignoredOptions: [], usd: 0.7, units: 387 * b.count, source: "estimate", priceNote: "", usesRefs: { image: false, video: false }, ignoresRefs: false, problem: null }));
      const total = items.reduce((t, i) => t + (i.units ?? 0), 0);
      await route.fulfill({ json: { preview: { compare: b.compare === true, blocked: blocked ? "You've reached your 5-hour usage limit. It resets in 3h." : null, items, totalUnits: total, priceKnown: true, large: total >= 1000, refs: { images: 0, video: false }, rightsNote: "" } } });
    });
    await openCreate(page, /^Video/);
    const form = page.getByRole("form", { name: "New video" });
    await form.getByLabel("Compare models").check();
    await expect(form.getByLabel("Outputs per model")).toHaveValue("6");
    await form.getByRole("textbox", { name: "Prompt" }).fill("A fox trots through snow at sunrise");
    const quote = page.getByTestId("video-quote");
    await expect(quote).toContainText("2,322 credits"); // 6 x 387
    await expect(quote).toContainText("Compare is Beta");
    await expect(quote).toContainText("only for clips that are delivered");
    await form.getByRole("checkbox", { name: /Kling 2.5/ }).check();
    await expect(quote).toContainText("4,644 credits"); // two models x 6 x 387 (Kling mocked as quoted here)
    await form.getByLabel("Outputs per model").selectOption("3");
    await expect(quote).toContainText("2,322 credits");
    // A large run needs a second acknowledgement in the approval step.
    await page.getByRole("button", { name: /preview and approve/i }).click();
    const dialog = page.getByTestId("video-confirm");
    await expect(dialog).toContainText("2,322 credits");
    await expect(dialog.getByRole("button", { name: "Approve and generate" })).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await expect(dialog.getByRole("button", { name: "Approve and generate" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    // A usage window that cannot cover the run is explained and the run cannot start.
    blocked = true;
    await form.getByLabel("Outputs per model").selectOption("4");
    await expect(page.getByTestId("video-blocked")).toContainText("5-hour usage limit");
    await expect(page.getByRole("button", { name: /preview and approve/i })).toBeDisabled();

    // Side-by-side grid: one column per model, failed/waiting tiles shown honestly.
    const grid = page.getByTestId("compare-grid");
    await expect(grid).toContainText("2 of 4 delivered");
    await expect(grid.getByText("Waiting for a free slot")).toBeVisible();
    await expect(grid).toContainText("Nothing was charged");
    await expect(grid.getByText("0 credits")).toHaveCount(1);
    // Pick one, remove the rest.
    await grid.getByRole("checkbox", { name: "Pick" }).first().check();
    await grid.getByTestId("remove-unselected").click();
    await expect.poll(() => removed.flat().sort().join(",")).toBe("a2,b1");
    await grid.getByRole("button", { name: "Select all" }).click();
    await expect(grid.getByRole("button", { name: "Download selected" })).toBeEnabled();
  });

  test("a Plus account sees what video needs; no controls to start", async ({ page }) => {
    const mail = EMAIL.replace("@", "+plus@");
    await signIn(page, mail);
    run("set-plan.ts", mail, "plus");
    await page.route("**/api/create/media/video", (route) => route.fulfill({ json: { config: videoConfig({ available: false, upgradeTo: "pro", message: "Video generation is part of Keplar Pro and Business, because every clip costs real money to make." }), jobs: [] } }));
    await openCreate(page, /^Video/);
    await expect(page.getByText(/part of Keplar Pro and Business/)).toBeVisible();
    await expect(page.getByRole("form", { name: "New video" })).toHaveCount(0);
  });

  test("images: model picker (Higgsfield default), model-specific seed/avoid, reference, outputs, live cost, remembered", async ({ page }) => {
    const mail = EMAIL.replace("@", "+img@");
    await signIn(page, mail);
    run("set-plan.ts", mail, "pro");
    const est = (v: number) => ({ low: { "1536x1024": v, "1024x1024": v, "1024x1536": v }, medium: { "1536x1024": v, "1024x1024": v, "1024x1536": v }, high: { "1536x1024": v, "1024x1024": v, "1024x1536": v } });
    const img = (id: string, label: string, def: boolean, seed: boolean, neg: boolean, units: number, provider = "higgsfield", available = true) => ({ id, label, provider, note: `${label} note`, available, default: def, supports: { seed, negativePrompt: neg, references: false }, estimates: est(units) });
    await page.route("**/api/images", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({ json: {
        config: {
          available: true, configured: true, provider: "higgsfield", plan: "pro",
          models: [img("hf/z-image/turbo", "Z-Image Turbo", true, true, false, 9), img("hf/alibaba/qwen-image-3/text-to-image", "Qwen Image 3", false, true, true, 42), img("openai/gpt-image-1-mini", "GPT Image (fallback)", false, false, false, 29, "openai", false)],
          references: { available: true, types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10_000_000, maxImages: 3, model: "Qwen Image 3 Edit", estimateUnits: 42, rightsNote: "Only upload images you own or have permission to use." },
          sizes: [{ id: "1536x1024", label: "Wide" }, { id: "1024x1024", label: "Square" }], qualities: [{ id: "high", label: "High", note: "" }, { id: "medium", label: "Standard", note: "" }],
          defaults: { size: "1536x1024", quality: "high" }, estimates: est(9), limits: { promptChars: 1000, perDay: 40, highPerDay: 16, concurrent: 2, storedImages: 200 }, paused: false, notice: null,
        },
        usage: { today: 0, stored: 0, running: 0 }, meter: { cooldown: null }, images: [],
      } });
    });
    await page.route("**/api/create/media/reference", (route) => route.fulfill({ json: { reference: { kind: "image", url: "https://example.test/ref.png", contentType: "image/png", bytes: PNG.length, name: "ref.png", token: "t".repeat(64) } } }));
    await openCreate(page, /^Images/);
    const form = page.getByRole("form", { name: "New image" });
    await expect(form.getByLabel("Model")).toHaveValue("hf/z-image/turbo");
    await expect(form.getByRole("option", { name: /Z-Image Turbo \(default\)/ })).toHaveCount(1);
    await expect(form.getByRole("option", { name: /GPT Image \(fallback\).*not configured/ })).toHaveAttribute("disabled", "");
    await expect(form.getByLabel(/Seed/)).toBeVisible();
    await expect(form.getByLabel(/Avoid/)).toHaveCount(0);
    await expect(form.getByLabel("Outputs")).toBeVisible();
    await expect(form).toContainText("9 credits");

    await form.getByLabel("Model").selectOption("hf/alibaba/qwen-image-3/text-to-image");
    await expect(form.getByLabel(/Avoid/)).toBeVisible();
    await expect(form).toContainText("42 credits");
    await form.getByLabel("Outputs").selectOption("2");
    await expect(form).toContainText("84 credits");

    // A reference switches to the edit model and its price, shows a preview with Remove, and needs the rights note.
    await form.getByTestId("reference-input").setInputFiles({ name: "ref.png", mimeType: "image/png", buffer: PNG });
    await expect(form.getByRole("img", { name: "ref.png" })).toBeVisible();
    await expect(form.getByText(/permission to use/)).toBeVisible();
    await expect(form.getByLabel("Model")).toBeDisabled();
    await expect(form.getByLabel(/Avoid/)).toHaveCount(0);
    await form.getByRole("button", { name: "Remove ref.png" }).click();
    await expect(form.getByRole("img", { name: "ref.png" })).toHaveCount(0);
    await expect(form.getByLabel("Model")).toBeEnabled();

    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("keplar.image.prefs.v1") ?? "{}"));
    expect(prefs.model).toBe("hf/alibaba/qwen-image-3/text-to-image");
    expect(prefs.count).toBe(2);
  });
  test("images: typing / opens slash menu; /BTS expands the prompt template", async ({ page }) => {
    const mail = EMAIL.replace("@", "+slash@");
    await signIn(page, mail);
    run("set-plan.ts", mail, "pro");
    await page.route("**/api/images", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({ json: {
        config: {
          available: true, configured: true, provider: "higgsfield", plan: "pro",
          models: [{ id: "hf/z-image/turbo", label: "Z-Image Turbo", provider: "higgsfield", note: "", available: true, default: true, supports: { seed: true, negativePrompt: false, references: false }, estimates: { high: { "1536x1024": 9, "1024x1024": 9, "1024x1536": 9 } } }],
          references: { available: true, types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10_000_000, maxImages: 3, model: "Qwen Image 3 Edit", estimateUnits: 42, rightsNote: "Only upload images you own or have permission to use." },
          sizes: [{ id: "1536x1024", label: "Wide" }], qualities: [{ id: "high", label: "High", note: "" }],
          defaults: { size: "1536x1024", quality: "high" }, estimates: { high: { "1536x1024": 9 } }, limits: { promptChars: 1000, perDay: 40, concurrent: 2, storedImages: 200 }, paused: false, notice: null,
        },
        usage: { today: 0, stored: 0, running: 0 }, meter: { cooldown: null }, images: [],
      } });
    });
    await openCreate(page, /^Images/);
    const form = page.getByRole("form", { name: "New image" });
    const box = form.locator("textarea").first();
    await box.click();
    await box.fill("");
    await box.pressSequentially("/", { delay: 20 });
    const menu = page.getByTestId("slash-command-menu");
    await expect(menu).toBeVisible();
    await menu.getByTestId("slash-cmd-bts").click();
    await expect(box).toHaveValue(/Behind-the-scenes production photograph/i);
  });

});
