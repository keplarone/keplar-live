import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyStep, normaliseKeys, parseStep, stepPrompt, COMPUTER_LIMITS } from "../src/lib/business/computer";
import { COMPUTER_ACTION, decideComputerStep } from "../src/lib/business/computer-step";
import { usedThisPeriod } from "../src/lib/create/platform/compute";
import { loadLiveCatalog } from "../src/lib/orchestration/catalog-sync";
import { testWorkspace } from "./helpers/workspace";

const screen = { width: 1280, height: 800 };

test("computer use: a model reply becomes one checked step", () => {
  const s = parseStep('Sure! {"type":"click","x":640.4,"y":100,"say":"Open the File menu","target":"File"}', screen);
  assert.deepEqual(s.action, { type: "click", x: 640, y: 100, button: "left", double: false });
  assert.equal(s.say, "Open the File menu");
  assert.equal(s.sensitive, false);
  assert.deepEqual(parseStep('{"type":"double_click","x":5,"y":5}', screen).action, { type: "click", x: 5, y: 5, button: "left", double: true });
  assert.deepEqual(parseStep('{"type":"scroll","dy":40}', screen).action, { type: "scroll", x: 640, y: 400, dy: 15 }, "scroll is clamped");
  assert.deepEqual(parseStep('{"type":"wait","ms":99999}', screen).action, { type: "wait", ms: COMPUTER_LIMITS.maxWaitMs });
  assert.equal(parseStep('{"type":"type","text":"hello {world}"}', screen).action.type, "type", "braces inside strings don't confuse the parser");
});

test("computer use: anything off-screen, unknown, oversized or unparseable stops instead of guessing", () => {
  for (const reply of ['{"type":"click","x":1280,"y":10}', '{"type":"click","x":-1,"y":10}', '{"type":"teleport"}', "no json here", "", '{"type":"type","text":""}', `{"type":"type","text":"${"a".repeat(COMPUTER_LIMITS.maxTypeChars + 1)}"}`]) {
    assert.equal(parseStep(reply, screen).action.type, "stop", reply.slice(0, 40));
  }
  assert.equal(parseStep(null, screen).action.type, "stop");
});

test("computer use: keys are allowlisted; the OS's reserved combos and the app's own stop shortcut are refused", () => {
  assert.equal(normaliseKeys("Ctrl + S"), "ctrl+s");
  assert.equal(normaliseKeys("command+c"), "cmd+c");
  assert.equal(normaliseKeys("Return"), "enter");
  for (const k of ["ctrl+alt+delete", "win+l", "alt+f4", "cmd+q", "ctrl+shift+x", "win+r", "ctrl+shift+esc", "printscreen", "ctrl+ctrl+s", ""]) assert.equal(normaliseKeys(k), null, k);
  assert.equal(parseStep('{"type":"key","keys":"alt+f4"}', screen).action.type, "stop");
});

test("computer use: spending, sending, deleting and signing in are always marked sensitive (the app asks first)", () => {
  assert.equal(parseStep('{"type":"click","x":10,"y":10,"say":"Click Buy now"}', screen).sensitive, true);
  assert.equal(parseStep('{"type":"click","x":10,"y":10,"say":"Send the email"}', screen).sensitive, true);
  assert.equal(parseStep('{"type":"key","keys":"enter","say":"Submit the form"}', screen).sensitive, true);
  assert.equal(parseStep('{"type":"click","x":10,"y":10,"say":"Open settings","sensitive":true}', screen).sensitive, true, "the model's own flag counts");
  assert.equal(parseStep('{"type":"click","x":10,"y":10,"say":"Open the Downloads folder","target":"Downloads"}', screen).sensitive, false);
});

test("computer use: the prompt carries the goal, recent steps and the screenshot size; the route is Business-only and stores nothing", () => {
  const p = stepPrompt("Rename the report", [{ say: "Open Finder", type: "click", ok: true }, { say: "Click Rename", type: "click", ok: false, note: "not found" }], screen);
  assert.match(p, /Goal: Rename the report/);
  assert.match(p, /2\. Click Rename \(failed: not found\)/);
  assert.match(p, /1280x800/);
  const route = readFileSync("src/app/api/business/computer/step/route.ts", "utf8");
  assert.ok(route.includes("requireBusiness(req)"));
  assert.ok(route.includes("assertSameOrigin(req)"));
  assert.doesNotMatch(route, /collection\(|insert\(/, "screenshots are never stored");
});

test("computer use (AI-6): the server decides what needs the person, whatever the model labels it", () => {
  // The model says the step is harmless and describes it blandly; what it is clicking or typing decides.
  const step = (o: Record<string, unknown>) => parseStep(JSON.stringify({ say: "Continue", sensitive: false, ...o }), screen);
  for (const target of ["Place order", "Pay $49.00", "Send", "Delete", "Confirm transfer", "Sign in", "Submit", "Install", "Allow"]) {
    const s = step({ type: "click", x: 10, y: 10, target });
    assert.equal(s.sensitive, true, target);
    assert.match(s.why ?? "", /may spend, send, delete, submit or sign in/, target);
  }
  assert.equal(step({ type: "click", x: 10, y: 10 }).sensitive, true, "an unreported click target fails closed");
  assert.equal(step({ type: "click", x: 10, y: 10, target: "Downloads" }).sensitive, false);
  // Typing: secret fields, card numbers, Enter inside the text, web addresses (a new site), unknown fields.
  assert.match(step({ type: "type", text: "hunter2", field: "Password" }).why ?? "", /password, payment or security field/);
  assert.match(step({ type: "type", text: "123", field: "CVC" }).why ?? "", /password, payment/);
  assert.match(step({ type: "type", text: "4111 1111 1111 1111", field: "Notes" }).why ?? "", /card, account or ID number/);
  assert.match(step({ type: "type", text: "hi team\n", field: "Message" }).why ?? "", /Enter/);
  assert.match(step({ type: "type", text: "evil.example.com/collect?d=1", field: "Search" }).why ?? "", /web address/);
  assert.match(step({ type: "type", text: "https://pay.example.net", field: "Address bar" }).why ?? "", /web address/);
  assert.equal(step({ type: "type", text: "quarterly report" }).sensitive, true, "typing into an unreported field fails closed");
  assert.equal(step({ type: "type", text: "quarterly report", field: "Search" }).sensitive, false);
  // Keys: Enter (any modifier) submits or sends; modified delete/backspace deletes.
  for (const keys of ["enter", "ctrl+enter", "cmd+enter", "cmd+backspace", "shift+delete"]) assert.equal(step({ type: "key", keys }).sensitive, true, keys);
  for (const keys of ["ctrl+s", "tab", "pagedown", "backspace"]) assert.equal(step({ type: "key", keys }).sensitive, false, keys);
  // The model's flag can still add caution, never remove it.
  assert.equal(step({ type: "click", x: 10, y: 10, target: "Downloads", sensitive: true }).sensitive, true);
  assert.equal(classifyStep({ type: "scroll", x: 1, y: 1, dy: 3 }), null);
});

test("computer use (AI-6): every step's vision call is checked against credits and charged at its real cost", async () => {
  const ws = await testWorkspace("computer-meter", "business");
  const model = loadLiveCatalog().find((m) => m.inputModalities?.includes("image"));
  assert.ok(model, "a vision model is in the roster");
  const seen: string[] = [];
  const registry = {
    once: async (input: { model: { id: string } }) => {
      seen.push(input.model.id);
      if (seen.length === 1) return { ok: false as const, modelId: input.model.id, reason: "error" as const, message: "x", latencyMs: 1, provider: "fake", live: false };
      return { ok: true as const, modelId: input.model.id, stance: "", claims: [], text: '{"type":"click","x":5,"y":5,"say":"Open Downloads","target":"Downloads"}', latencyMs: 1, usage: { inputTokens: 3000, outputTokens: 100 }, actualCostUsd: 0.05, provider: "fake", live: false };
    },
  };
  const before = await usedThisPeriod(ws);
  const out = await decideComputerStep(ws, { goal: "Open my downloads", history: [], screen, shot: "data:image/png;base64,AAAA" }, { registry: registry as never, models: [model!, model!] });
  assert.equal(out.step.action.type, "click");
  assert.equal(seen.length, 2, "the failed first attempt fell through to the next model");
  assert.ok(out.units >= 28, `charged with the margin: ${out.units}`); // $0.05 x 1.1 / $0.002 per credit
  assert.equal((await usedThisPeriod(ws)) - before, out.units, "the charge is on the account's ledger");
  assert.equal(COMPUTER_ACTION, "agent.computer");
  const route = readFileSync("src/app/api/business/computer/step/route.ts", "utf8");
  assert.match(route, /decideComputerStep\(ws,/, "the route goes through the metered path");
  assert.doesNotMatch(route, /registry\.once\(/, "no unmetered model call is left in the route");
});
