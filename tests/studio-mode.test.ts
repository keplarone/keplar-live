import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resultText, STUDIO_PLANS, studioBridge } from "@/lib/desktop/studio-bridge";
import { pathForView, viewForPath } from "@/components/app-ui/app-paths";

test("Roblox Studio mode: Lite and up only, desktop-only (no bridge outside the desktop app), at /app/studio", () => {
  assert.equal(STUDIO_PLANS.has("free"), false);
  for (const p of ["lite", "plus", "pro"]) assert.equal(STUDIO_PLANS.has(p), true, p);
  assert.equal(studioBridge(), null, "no window here, so no bridge");
  assert.equal(pathForView("studio"), "/app/studio");
  assert.equal(viewForPath("/app/studio"), "studio");
  const side = readFileSync("src/components/app-ui/Sidebar.tsx", "utf8");
  assert.match(side, /useSyncExternalStore\(noSubscribe, \(\) => Boolean\(studioBridge\(\)\), \(\) => false\)/, "the sidebar row only appears with the desktop bridge");
});

test("Studio tool results: text blocks are joined; failed calls read as empty", () => {
  assert.equal(resultText({ ok: true, result: { content: [{ type: "text", text: "a" }, { type: "image", data: "x" }, { type: "text", text: "b" }] } }), "a\nb");
  assert.equal(resultText({ ok: false, error: "Studio is not open" }), "");
});
