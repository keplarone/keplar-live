import { test, expect, type Page } from "playwright/test";

/**
 * The desktop Studio overlay (/app/studio/overlay, Solar 5.8 Ultra) with a stand-in for the desktop app's Studio bridge and
 * scripted agent turns: the glass is see-through, the Solar core renders and follows the real run (a Studio step running,
 * then finished), the model details name the real model, and Studio and Blender switch.
 */
async function stage(page: Page) {
  await page.addInitScript(() => {
    const text = (t: string) => ({ ok: true, result: { content: [{ type: "text", text: t }] } });
    const status = { state: "connected", tools: ["list_roblox_studios", "screen_capture", "search_game_tree", "execute_luau"] };
    const blender = { state: "connected", file: "scene.blend", tools: [] };
    (window as unknown as { keplarStudio: unknown }).keplarStudio = {
      version: 3, status: async () => status, connect: async () => status, disconnect: async () => status, tools: async () => [], onStatus: () => () => {},
      call: async (name: string) => {
        if (name === "list_roblox_studios") return text(JSON.stringify({ studios: [{ id: "s1", name: "Place1" }] }));
        if (name === "search_game_tree") return text("Workspace\n  Baseplate");
        if (name === "screen_capture") return { ok: true, result: { content: [] } };
        await new Promise((r) => setTimeout(r, 1500));
        return text("done");
      },
      blender: { status: async () => blender, connect: async () => blender, setup: async () => ({ ok: true, message: "" }), disconnect: async () => blender, tools: async () => [], call: async () => ({ ok: true, result: { content: [] } }), onStatus: () => () => {} },
      overlay: { state: async () => ({ open: true, collapsed: false, seeThrough: false }), open: async () => ({}), close: async () => ({}), collapse: async () => ({}), seeThrough: async () => ({}), onState: () => () => {} },
    };
  });
  let turn = 0;
  await page.route("**/api/compute", (r) => r.fulfill({ json: { plan: "pro", signedIn: true } }));
  await page.route("**/api/billing/studio-topup**", (r) => r.fulfill({ json: { enabled: false, choice: null } }));
  await page.route("**/api/studio/chats**", (r) => r.fulfill({ status: 404, json: {} }));
  await page.route("**/api/studio/agent", async (r) => {
    const turns = [
      { text: "Here is the plan:\n1. Lay a lava floor\n2. Add checkpoints\n3. Light the course", actions: [], done: false },
      { text: "Step 1: laying the floor.", actions: [{ id: "a1", name: "execute_luau", args: { code: "local p = Instance.new('Part')" }, risk: "change" }], done: false },
      { text: "Step 3: done. Play-test it.", actions: [], done: true },
    ];
    const t = turns[Math.min(turn++, 2)]!;
    await new Promise((res) => setTimeout(res, 400));
    await r.fulfill({ json: { message: { role: "assistant", content: t.text }, text: t.text, actions: t.actions, blocked: [], done: t.done, units: 100 } });
  });
}

test("Solar overlay: see-through glass, a live core that follows the run, honest model details", async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 760 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await stage(page);
  await page.goto("/app/studio/overlay");
  const core = page.locator('[role="img"][data-state]');
  await expect(core).toHaveAttribute("data-ready", "", { timeout: 30_000 });
  await expect(core).toHaveAttribute("data-state", "idle");

  // The page and the panel let the window behind show through.
  const alpha = await page.evaluate(() => {
    const parse = (c: string) => { const m = /rgba?\(([^)]+)\)/.exec(c); return m ? Number(m[1]!.split(/[ ,/]+/).filter(Boolean)[3] ?? 1) : 1; };
    return { page: parse(getComputedStyle(document.body).backgroundColor), panelTint: getComputedStyle(document.querySelector('[data-solar]')!).getPropertyValue("--glass-tint").trim() };
  });
  expect(alpha.page).toBe(0);
  expect(alpha.panelTint).toMatch(/transparent/);

  await page.getByRole("button", { name: "Solar 5.8 Ultra" }).click();
  const about = page.getByRole("dialog", { name: "About Solar 5.8 Ultra" });
  await expect(about).toContainText("Keplar's building experience");
  await expect(about).not.toContainText("claude-opus");
  await page.keyboard.press("Escape");
  await expect(about).toHaveCount(0);

  const box = page.locator("textarea");
  await box.fill("A lava obby");
  await expect(core).toHaveAttribute("data-state", "typing");
  await box.press("Enter");
  await page.getByRole("button", { name: /^Approve/ }).click();
  await expect(core).toHaveAttribute("data-state", "building");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(core).toHaveAttribute("data-state", "done", { timeout: 30_000 });
  await expect(page.getByText("3/3")).toBeVisible();

  await page.getByRole("button", { name: "Blender", exact: true }).click();
  await expect(page.getByRole("button", { name: "Blender", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("scene.blend")).toBeVisible();
  expect(errors).toEqual([]);
});
