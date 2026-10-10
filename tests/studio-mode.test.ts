import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resultText, STUDIO_PLANS, studioBridge } from "@/lib/desktop/studio-bridge";
import { pathForView, viewForPath } from "@/components/app-ui/app-paths";

const read = (p: string) => readFileSync(p, "utf8");

test("Roblox Studio mode: Lite and up only, desktop-only (no bridge outside the desktop app), at /app/studio", () => {
  assert.equal(STUDIO_PLANS.has("free"), false);
  for (const p of ["lite", "plus", "pro"]) assert.equal(STUDIO_PLANS.has(p), true, p);
  assert.equal(studioBridge(), null, "no window here, so no bridge");
  assert.equal(pathForView("studio"), "/app/studio");
  assert.equal(viewForPath("/app/studio"), "studio");
  // It lives in Create as a tab that only appears with the desktop bridge, not in the sidebar.
  const create = readFileSync("src/components/create/CreateStudio.tsx", "utf8");
  assert.match(create, /useSyncExternalStore\(noSubscribe, \(\) => Boolean\(studioBridge\(\)\), \(\) => false\)/);
  assert.match(create, /\{desktop \? tab\("roblox", "Roblox Studio"\) : null\}/);
  assert.doesNotMatch(readFileSync("src/components/app-ui/Sidebar.tsx", "utf8"), /studioBridge/);
});

test("Studio tool results: text blocks are joined; failed calls read as empty", () => {
  assert.equal(resultText({ ok: true, result: { content: [{ type: "text", text: "a" }, { type: "image", data: "x" }, { type: "text", text: "b" }] } }), "a\nb");
  assert.equal(resultText({ ok: false, error: "Studio is not open" }), "");
});

test("studio run: reads Keplar's plan, its step markers and Studio's place list", async () => {
  const { parsePlan, stepMarker, parsePlaces } = await import("../src/components/app-ui/studio-mode/useStudioAgent");
  assert.deepEqual(parsePlan("Here is the plan:\n1. Street grid\n2. **Towers** with trim\n3) Lighting\nThen I start."), ["Street grid", "Towers with trim", "Lighting"]);
  assert.equal(parsePlan("1. Only\n2. Two"), null);
  assert.equal(stepMarker("Step 3: Lighting the night scene."), 3);
  assert.equal(stepMarker("**Step 12** done"), 12);
  assert.equal(stepMarker("Next step 2"), null);
  assert.deepEqual(parsePlaces(JSON.stringify({ studios: [{ id: "a1", name: "Keplar Testing (placeId: 132547270460088)" }, { id: "b2", name: "Place1" }] })), [{ id: "a1", name: "Keplar Testing" }, { id: "b2", name: "Place1" }]);
  assert.deepEqual(parsePlaces("not json"), []);
});

test("studio overlay: its own bare page, transparent, and the main page offers it on desktop builds that have it", () => {
  const page = read("src/app/app/studio/overlay/page.tsx");
  assert.match(page, /data-overlay/);
  assert.match(read("src/styles/redesign.css"), /html\[data-overlay\], html\[data-overlay\] body \{ background: transparent !important/);
  const view = read("src/components/app-ui/studio-mode/StudioView.tsx");
  assert.match(view, /\{bridge\.overlay \? <button/);
  assert.match(view, />Float over Studio</);
  assert.match(read("src/components/app-ui/studio-mode/studio-overlay.module.css"), /-webkit-app-region: drag/);
});
