import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normaliseKeys, parseStep, stepPrompt, COMPUTER_LIMITS } from "../src/lib/business/computer";

const screen = { width: 1280, height: 800 };

test("computer use: a model reply becomes one checked step", () => {
  const s = parseStep('Sure! {"type":"click","x":640.4,"y":100,"say":"Open the File menu"}', screen);
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
  assert.equal(parseStep('{"type":"click","x":10,"y":10,"say":"Open the Downloads folder"}', screen).sensitive, false);
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
