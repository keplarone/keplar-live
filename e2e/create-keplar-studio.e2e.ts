import { test, expect, type Page } from "playwright/test";

/**
 * Create -> Keplar Studio -> Roblox Studio | Blender. With a stand-in for the desktop app's bridge (nothing connected, so no
 * Studio or Blender is faked as running): one Keplar Studio tab replaces the old Roblox Studio and Blender tabs, legacy links
 * (?tab=roblox, ?tab=blender) land on it with the right environment and are rewritten to ?tab=studio&env=…, the switch is
 * keyboard-operable, and ?tab=studio alone reopens the environment used last. Without the bridge (a browser) the same
 * links land on App with a note that links to the real download page.
 */
async function stage(page: Page, bridge: boolean) {
  if (bridge) {
    await page.addInitScript(() => {
      const status = { state: "disconnected", tools: [] };
      const blender = { state: "disconnected", file: null, tools: [] };
      (window as unknown as { keplarStudio: unknown }).keplarStudio = {
        version: 3, status: async () => status, connect: async () => status, disconnect: async () => status, tools: async () => [], onStatus: () => () => {},
        call: async () => ({ ok: false, error: "Studio is not open" }),
        blender: { status: async () => blender, connect: async () => blender, setup: async () => ({ ok: true, message: "" }), disconnect: async () => blender, tools: async () => [], call: async () => ({ ok: false, error: "Blender is not open" }), onStatus: () => () => {} },
        overlay: { state: async () => ({ open: false, collapsed: false, seeThrough: false }), open: async () => ({}), close: async () => ({}), collapse: async () => ({}), seeThrough: async () => ({}), onState: () => () => {} },
      };
    });
  }
  await page.route("**/api/compute", (r) => r.fulfill({ json: { plan: "pro", signedIn: true, used: 0, total: null, resetsAt: null, paused: false, windows: null, account: { id: "e2e-studio", email: "studio@example.com", name: "Alex" } } }));
  await page.route("**/api/billing/studio-topup**", (r) => r.fulfill({ json: { enabled: false, choice: null } }));
  await page.route("**/api/studio/chats**", (r) => r.fulfill({ status: 404, json: {} }));
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

test("desktop app: one Keplar Studio tab with a Roblox Studio | Blender switch; legacy links still land", async ({ page }) => {
  await stage(page, true);
  await page.goto("/app/create?tab=roblox", { waitUntil: "domcontentloaded" });
  const envs = page.getByRole("tablist", { name: "Environment" });
  await expect(envs).toBeVisible({ timeout: 60_000 });
  await expect(tab(page, "Keplar Studio")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Roblox Studio")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/[?&]tab=studio&env=roblox/);
  const kinds = await page.getByRole("tablist", { name: "Create" }).getByRole("tab").allTextContents();
  expect(kinds.filter((k) => /Roblox|Blender/.test(k))).toEqual([]);
  // The pane mounts the Keplar Studio Workspace: Studio is not connected (nothing is faked), so it asks to connect.
  const robloxPanel = page.locator("#keplar-studio-panel-roblox");
  await expect(robloxPanel.getByRole("region", { name: "Connect to Roblox Studio" })).toBeVisible({ timeout: 60_000 });
  await expect(robloxPanel.getByRole("navigation", { name: "Keplar Studio" })).toBeVisible();

  await tab(page, "Blender").click();
  await expect(tab(page, "Blender")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/[?&]tab=studio&env=blender/);

  await expect(page.locator("#keplar-studio-panel-blender").getByRole("region", { name: /Blender/ }).first()).toBeVisible();
  // The Workspace's own environment entries switch the same pane (no second, out-of-sync switch).
  await page.locator("#keplar-studio-panel-blender").getByRole("navigation", { name: "Keplar Studio" }).getByRole("button", { name: "Roblox Studio" }).click();
  await expect(tab(page, "Roblox Studio")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/[?&]tab=studio&env=roblox/);
  await tab(page, "Blender").click();

  await tab(page, "Blender").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tab(page, "Roblox Studio")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Roblox Studio")).toBeFocused();

  await tab(page, "Blender").click();
  await page.goto("/app/create?tab=studio", { waitUntil: "domcontentloaded" });
  await expect(tab(page, "Blender")).toHaveAttribute("aria-selected", "true", { timeout: 60_000 });

  await page.goto("/app/create?tab=blender", { waitUntil: "domcontentloaded" });
  await expect(tab(page, "Blender")).toHaveAttribute("aria-selected", "true", { timeout: 60_000 });
  await tab(page, "App").click();
  await expect(page).not.toHaveURL(/[?&](tab|env)=/);
});

test("browser: Studio links land on App with a truthful note, no Keplar Studio tab", async ({ page }) => {
  await stage(page, false);
  await page.goto("/app/create?tab=blender", { waitUntil: "domcontentloaded" });
  const note = page.getByRole("note", { name: "Keplar Studio" });
  await expect(note).toBeVisible({ timeout: 60_000 });
  await expect(tab(page, "App")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Keplar Studio")).toHaveCount(0);
  await expect(note.getByRole("link", { name: "Download the desktop app" })).toHaveAttribute("href", "/download");
  await note.getByRole("button", { name: "Dismiss" }).click();
  await expect(note).toHaveCount(0);
});
