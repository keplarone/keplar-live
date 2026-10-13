import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, docsIndex, formatDocsHits, ROBLOX_DOCS_MAX_CHARS, searchDocs, tokenize } from "../src/lib/studio/roblox-docs";
import { ROBLOX_DOCS_TOOL, ROBLOX_DOCS_TOOL_NAME } from "../src/lib/studio/roblox-docs-tool";
import { buildTools, riskOf, STUDIO_SYSTEM, withKeplarStudioTools } from "../src/lib/studio/agent";
import { BLENDER_TOOL_POLICY } from "../src/lib/blender/agent";
import { CLOUD_TOOL_DEFS, CLOUD_TOOL_POLICY, runCloudTool } from "../src/lib/roblox-cloud/tools";
import { ROBLOX_CLOUD_PROFILE, ROBLOX_CLOUD_SYSTEM } from "../src/lib/roblox-cloud/prompt";

const titles = (q: string, k = 5) => searchDocs(docsIndex(), q, k).map((h) => h.title);

test("roblox docs: API names count whole and split, stop words are dropped", () => {
  assert.deepEqual(tokenize("TweenService:Create"), ["tweenservice", "tween", "service", "create"]);
  assert.deepEqual(tokenize("how do I use the UIGradient"), ["uigradient", "ui", "gradient"]);
});

test("roblox docs: the shipped index covers the guides and the Engine API reference", () => {
  const index = docsIndex();
  assert.ok(index.chunks.length > 10_000, `${index.chunks.length} chunks`);
  assert.match(index.commit, /^[0-9a-f]{40}$/);
  assert.ok(index.chunks.every(([title, url, text]) => title && url.startsWith("https://create.roblox.com/docs") && text.length >= 40));
});

test("roblox docs: an exact API name ranks first", () => {
  assert.equal(titles("TweenService:Create")[0], "TweenService:Create");
  assert.equal(titles("ScreenGui.ScreenInsets")[0], "ScreenGui.ScreenInsets");
  assert.equal(titles("AnimationClipProvider:RegisterAnimationClip")[0], "AnimationClipProvider:RegisterAnimationClip");
  assert.equal(titles("Enum.AnimationPriority")[0], "Enum.AnimationPriority");
});

test("roblox docs: plain words find the right pages", () => {
  assert.ok(titles("flipbook layout particle emitter", 8).some((t) => /Flipbook/i.test(t)), "flipbooks");
  assert.ok(titles("safe area insets notch screen gui", 8).some((t) => /ScreenInsets|safe area/i.test(t)), "safe areas");
  assert.ok(titles("process receipt developer product purchase", 8).some((t) => /ProcessReceipt|developer product/i.test(t)), "receipts");
});

test("roblox docs: results carry links, stay under the cap, and a miss says how to retry", () => {
  const index = docsIndex();
  const text = formatDocsHits("TweenService", searchDocs(index, "TweenService", 8), index.commit);
  assert.ok(text.length <= ROBLOX_DOCS_MAX_CHARS + 200, `${text.length} chars`);
  assert.match(text, /https:\/\/create\.roblox\.com\/docs\/reference\/engine\/classes\/TweenService/);
  assert.match(formatDocsHits("zzzz", [], index.commit), /No Roblox docs matched/);
  assert.equal(searchDocs(buildIndex([]), "anything").length, 0);
  assert.equal(searchDocs(index, "TweenService", 99).length, 8, "limit is capped");
});

test("roblox docs tool: offered first in Studio mode, read-only, and only Keplar's definition", () => {
  const spoof = { name: ROBLOX_DOCS_TOOL_NAME, description: "something else", inputSchema: { type: "object", properties: {} } };
  const tools = buildTools(withKeplarStudioTools([{ name: "list_roblox_studios" }, spoof, { name: "execute_luau" }]));
  assert.deepEqual(tools.map((t) => t.function.name), [ROBLOX_DOCS_TOOL_NAME, "list_roblox_studios", "execute_luau"]);
  assert.equal(tools[0]!.function.description, ROBLOX_DOCS_TOOL.description);
  assert.equal(riskOf(ROBLOX_DOCS_TOOL_NAME, { query: "TweenService" }), "read");
  assert.throws(() => buildTools(withKeplarStudioTools("nope")), /tools must be a list/);
  assert.ok(!(ROBLOX_DOCS_TOOL_NAME in BLENDER_TOOL_POLICY), "Blender mode does not get it");
});

test("roblox cloud: offers roblox_docs as a read and answers it on the server from the same index", async () => {
  const tools = buildTools(CLOUD_TOOL_DEFS as unknown as unknown[], (n) => CLOUD_TOOL_POLICY[n]);
  assert.ok(tools.some((t) => t.function.name === ROBLOX_DOCS_TOOL_NAME));
  assert.equal(ROBLOX_CLOUD_PROFILE.riskOf(ROBLOX_DOCS_TOOL_NAME, {}), "read");
  const st = { files: new Map(), tree: "", jobId: "j", workspaceId: "w", dirty: new Set<string>() };
  const r = await runCloudTool(st, ROBLOX_DOCS_TOOL_NAME, { query: "TweenService:Create" });
  assert.match(r.text, /## TweenService:Create\nhttps:\/\/create\.roblox\.com\/docs\/reference\/engine\/classes\/TweenService#Create/);
  assert.deepEqual(r.effects, {});
  assert.match((await runCloudTool(st, ROBLOX_DOCS_TOOL_NAME, { query: "  " })).text, /Say what to look up/);
  assert.match(ROBLOX_CLOUD_SYSTEM, /look it up with roblox_docs/);
});

test("studio prompt: looks APIs up, and carries the UI, animation and game-systems craft", () => {
  for (const s of ["roblox_docs", "Never guess an API", "CoreUISafeInsets", "44 px", "UserInputService.PreferredInput", "Animator:LoadAnimation", "KeyframeSequence", "AnimationClipProvider:RegisterAnimationClip", "never present a temporary id as published", "GetMarkerReachedSignal", "IKControl", "UpdateAsync", "BindToClose", "ProcessReceipt", "idempotent"]) {
    assert.ok(STUDIO_SYSTEM.includes(s), s);
  }
});
