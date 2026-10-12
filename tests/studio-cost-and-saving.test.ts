import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { riskOf, STUDIO_LIMITS, STUDIO_MODEL, STUDIO_SYSTEM, withCacheBreakpoint, type StudioMessage } from "../src/lib/studio/agent";
import { placeKey, repairHistory, SAVE_MAX_CHARS, toSaved } from "../src/components/app-ui/studio-mode/saved-session";
import type { Item, Msg } from "../src/components/app-ui/studio-mode/useStudioAgent";

test("cost: the conversation is cached up to its newest message; earlier messages are untouched", () => {
  const msgs: StudioMessage[] = [
    { role: "user", content: "Build a shop" },
    { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "execute_luau", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "c1", content: "Done." },
  ];
  const out = withCacheBreakpoint(msgs) as { role: string; content: unknown }[];
  assert.deepEqual(out[2]!.content, [{ type: "text", text: "Done.", cache_control: { type: "ephemeral" } }], "the newest tool result carries the breakpoint");
  assert.equal(out[0]!.content, "Build a shop", "earlier messages stay byte-identical, so the cached prefix matches next turn");
  assert.equal(msgs[2]!.content, "Done.", "the input is not mutated");
  // An assistant turn with only tool calls cannot carry it: the message before it does.
  const out2 = withCacheBreakpoint(msgs.slice(0, 2)) as { content: unknown }[];
  assert.deepEqual(out2[0]!.content, [{ type: "text", text: "Build a shop", cache_control: { type: "ephemeral" } }]);
  const route = readFileSync("src/lib/studio/agent.ts", "utf8");
  assert.match(route, /if \(res\.status === 400\) res = await ask\(input\.messages\);/, "a rejected marker falls back to the old request, never a failed turn");
});

test("cost: Opus 5.5 stays, with a smaller thinking budget and no self play-testing", () => {
  assert.equal(STUDIO_MODEL, "claude-opus-5-5");
  assert.ok(STUDIO_LIMITS.reasoningTokens <= 3_000, `thinking budget ${STUDIO_LIMITS.reasoningTokens}`);
  for (const t of ["start_stop_play", "character_navigation", "user_mouse_input", "user_keyboard_input"]) assert.equal(riskOf(t, {}), "blocked", `${t} is the person's job now`);
  assert.match(STUDIO_SYSTEM, /do not play-test: the person play-tests/);
  assert.match(STUDIO_SYSTEM, /"How to test it" list/);
  assert.doesNotMatch(STUDIO_SYSTEM, /Verify like a professional after every visible change/);
  const hook = readFileSync("src/components/app-ui/studio-mode/useStudioAgent.ts", "utf8");
  assert.doesNotMatch(hook, /REVIEW_PROMPT/, "no forced self-review pass (fresh screenshots and re-checks every run)");
  assert.match(hook, /firstLook \? capture\(p\) : Promise\.resolve\(null\)/, "one screenshot per session; follow-ups send the tree only");
  assert.match(hook, /bridge\.call\("start_stop_play", \{ studio_id: p\.id, is_start: start \}\)/, "the Play test button calls Studio directly");
});

test("saving: one chat per game, keyed by placeId (stable across launches), else by name", () => {
  assert.equal(placeKey({ name: "Keplar Testing", placeId: "132547270460088" }), "keplar-studio-chat:id:132547270460088");
  assert.equal(placeKey({ name: "My Obby" }), "keplar-studio-chat:name:my obby");
  assert.equal(placeKey(null), null);
});

test("saving: no images or thinking kept, interrupted steps repaired, and it fits in storage", () => {
  const big = "data:image/png;base64," + "A".repeat(200_000);
  const history: Msg[] = [
    { role: "user", content: [{ type: "text", text: "Studio screenshot before this request" }, { type: "image_url", image_url: { url: big } }] },
    { role: "user", content: "Add a door" },
    { role: "assistant", content: "Step 1: Door.", reasoning_details: [{ type: "reasoning.text", text: "x".repeat(50_000) }], tool_calls: [{ id: "c1", type: "function", function: { name: "execute_luau", arguments: "{}" } }, { id: "c2", type: "function", function: { name: "execute_luau", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "c1", content: "Done." },
    // c2 never ran: the app was closed while it waited for approval
  ];
  const items: Item[] = [
    { kind: "user", key: "u", text: "Add a door", images: [big] },
    { kind: "action", key: "a", name: "execute_luau", args: {}, risk: "change", status: "waiting" },
  ];
  const saved = toSaved({ name: "Shop", items, history, plan: ["Door"], current: 1, finished: false, built: [], stats: { steps: 1, changes: 0, errors: 0 }, units: 12 });
  const json = JSON.stringify(saved);
  assert.ok(!json.includes("data:image"), "no screenshots or references stored");
  assert.ok(!json.includes("reasoning_details"), "no old thinking blocks");
  assert.ok(json.length < SAVE_MAX_CHARS);
  assert.deepEqual(saved.items[0], { kind: "user", key: "u", text: "Add a door", images: [] });
  assert.equal((saved.items[1] as Extract<Item, { kind: "action" }>).status, "skipped", "a step left waiting is shown as not run");
  const tool = saved.history.filter((m) => m.role === "tool") as Extract<Msg, { role: "tool" }>[];
  assert.deepEqual(tool.map((m) => m.tool_call_id), ["c1", "c2"], "every tool call has a result, so the conversation can continue");
  assert.match(tool[1]!.content, /Not run: the session was closed/);
  assert.deepEqual(repairHistory(saved.history), saved.history, "repair is stable");
});
