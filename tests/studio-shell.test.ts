/**
 * Keplar Studio shell (src/components/app-ui/studio-mode/workspace: Workspace, OverlayShell, SolarSelector, ControlCenter,
 * Inspector, layout/*): the pure status and layout logic, and source checks that the bridge behaviour of the old screens
 * (StudioOverlay, StudioView, BlenderView) carried over and that the Solar mode goes with every turn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activeTask, ago, connectionDot, elapsedMs, formatElapsed, isCreditStop, lastWarning, operationText, planProgress, runDot, runSpan, type RunView,
} from "@/components/app-ui/studio-mode/workspace/layout/run-status";
import { applyPreset, DEFAULT_LAYOUT, layoutFromSnapshot, parseLayout, presetOf, serializeLayout } from "@/components/app-ui/studio-mode/workspace/layout/layout-state";
import type { StudioEvent } from "@/components/app-ui/studio-mode/code/events";
import type { Item } from "@/components/app-ui/studio-mode/useStudioAgent";

const read = (p: string) => readFileSync(p, "utf8");
const W = "src/components/app-ui/studio-mode/workspace/";
const idle: RunView = { items: [], running: false, paused: false, looking: false, finished: false, playing: false, current: 0, plan: [], place: null };
const on = { state: "connected" };

test("operation text follows the run (the old overlay's statusText, plus approvals and play tests)", () => {
  assert.equal(operationText(idle, "roblox", { state: "connecting" }), "Connecting to Studio…");
  assert.equal(operationText(idle, "blender", { state: "missing", message: "Blender is not running." }), "Blender is not running.");
  assert.equal(operationText(idle, "roblox", { state: "idle" }), "Not connected to Studio");
  assert.equal(operationText({ ...idle, looking: true }, "roblox", on), "Looking at your place…");
  assert.equal(operationText({ ...idle, looking: true }, "blender", on), "Reading the scene…");
  assert.equal(operationText({ ...idle, running: true }, "roblox", on), "Planning…");
  const plan = [{ text: "a", state: "done" as const }, { text: "b", state: "doing" as const }, { text: "c", state: "next" as const }];
  assert.equal(operationText({ ...idle, running: true, current: 2, plan }, "roblox", on), "Building · step 2 of 3");
  const waiting: Item = { kind: "action", key: "k", name: "execute_luau", args: {}, risk: "change", status: "waiting" };
  assert.equal(operationText({ ...idle, running: true, items: [waiting] }, "roblox", on), "Waiting for your approval");
  assert.equal(runDot({ ...idle, running: true, items: [waiting] }, on), "warning");
  assert.equal(operationText({ ...idle, paused: true }, "roblox", on), "Paused");
  assert.equal(operationText({ ...idle, playing: true }, "roblox", on), "Play-testing");
  assert.equal(operationText({ ...idle, finished: true }, "roblox", on), "Finished");
  assert.equal(operationText({ ...idle, place: { name: "Obby" } }, "roblox", on), "Obby");
  assert.equal(operationText(idle, "roblox", on), "Ready");
  assert.equal(connectionDot({ state: "error" }), "error");
  assert.deepEqual(planProgress(plan), { done: 1, total: 3 });
});

test("task, warnings and the credit stop come from the real conversation", () => {
  const items: Item[] = [
    { kind: "user", key: "1", text: "  A lava obby ", images: [] },
    { kind: "note", key: "2", text: "Studio is paused. Review auto top-up, then choose Continue. Any pending payment will be checked before another charge.", tone: "warn" },
  ];
  assert.equal(activeTask(items), "A lava obby");
  assert.equal(activeTask([{ kind: "user", key: "u", text: "", images: ["a", "b"] }]), "2 reference images");
  assert.equal(activeTask([]), null);
  assert.ok(isCreditStop(lastWarning(items)));
  // A warning from an earlier request does not carry over to the next one.
  assert.equal(lastWarning([...items, { kind: "user", key: "3", text: "again", images: [] }]), null);
});

test("elapsed time is the current run's span in the event log (pauses included, Look again excluded)", () => {
  const ev = (id: number, at: number, body: Record<string, unknown>) => ({ id, at, turn: 1, ...body }) as unknown as StudioEvent;
  const log = [
    ev(1, 1000, { kind: "request.sent", surface: "studio", mode: null, messages: 1 }),
    ev(2, 5000, { kind: "run.finished", changed: true }),
    ev(3, 9000, { kind: "studio.looked", via: "refresh", screenshot: true, items: null, action: null }),
  ];
  assert.deepEqual(runSpan(log), { start: 1000, end: 5000 });
  assert.equal(elapsedMs(log, false, 99_000), 4000);
  const next = [...log, ev(4, 20_000, { kind: "request.sent", surface: "studio", mode: "high", messages: 3 }), ev(5, 21_000, { kind: "run.paused", reason: "person" }), ev(6, 30_000, { kind: "run.resumed" })];
  assert.deepEqual(runSpan(next), { start: 20_000, end: 30_000 });
  assert.equal(elapsedMs(next, true, 35_000), 15_000);
  assert.equal(runSpan([]), null);
  assert.equal(formatElapsed(7_900), "0:07");
  assert.equal(formatElapsed(252_000), "4:12");
  assert.equal(formatElapsed(3_729_000), "1:02:09");
  assert.equal(ago(1000, 13_000), "12 s ago");
});

test("layout: presets, Viewport falls back to Changes in Blender, parse rejects junk, live snapshot merges the split", () => {
  const code = applyPreset(DEFAULT_LAYOUT, "code", "roblox");
  assert.equal(code.tab, "code");
  assert.equal(presetOf(code, "roblox"), "code");
  assert.equal(presetOf(applyPreset(DEFAULT_LAYOUT, "conversation", "roblox"), "roblox"), "conversation");
  assert.equal(applyPreset(DEFAULT_LAYOUT, "viewport", "blender").tab, "changes");
  assert.equal(presetOf({ ...DEFAULT_LAYOUT, view: "simple" }, "roblox"), null);
  assert.deepEqual(parseLayout(serializeLayout(code)), code);
  assert.equal(parseLayout("{"), null);
  assert.equal(parseLayout(JSON.stringify({ v: 2 })), null);
  assert.equal(parseLayout(JSON.stringify({ ...code, tab: "nope" }))?.tab, "code");
  const snap = `${serializeLayout({ ...DEFAULT_LAYOUT, navCollapsed: true })}\u0000${JSON.stringify({ v: 1, size: 40, collapsed: true })}`;
  const l = layoutFromSnapshot(snap);
  assert.equal(l.navCollapsed, true);
  assert.deepEqual(l.split, { size: 40, collapsed: true });
  assert.deepEqual(layoutFromSnapshot(null), DEFAULT_LAYOUT);
});

test("the selected Solar mode is persisted and sent with every turn, on the page and in the overlay", () => {
  const sel = read(W + "SolarSelector.tsx");
  assert.match(sel, /localStorage\.setItem\(SOLAR_MODE_KEY, m\)/);
  assert.match(sel, /fetch\("\/api\/studio\/modes"/);
  assert.match(sel, /UltimateMark active=\{ultimate\}/);
  const page = read(W + "Workspace.tsx");
  assert.match(page, /useStudioAgent\(bridge, isBlender \? "blender" : "studio", \{ solarMode: mode \}\)/);
  const ov = read(W + "OverlayShell.tsx");
  assert.match(ov, /useStudioAgent\(bridge, "studio", \{ solarMode: mode \}\)/);
  assert.match(ov, /useStudioAgent\(bb, "blender", \{ solarMode: mode \}\)/);
  // useStudioAgent turns solarMode into the request body's `mode`.
  assert.match(read("src/components/app-ui/studio-mode/useStudioAgent.ts"), /\.\.\.\(sentMode \? \{ mode: sentMode \} : \{\}\)/);
});

test("overlay keeps StudioOverlay's bridge behaviour", () => {
  const ov = read(W + "OverlayShell.tsx");
  assert.match(ov, /root\.setAttribute\("data-overlay", ""\)/);
  assert.match(ov, /e\.key === OVERLAY_TARGET_KEY/);
  assert.match(ov, /disabled=\{a\.running\}/);
  assert.match(ov, /canPlayTest=\{!isBlender\}/);
  assert.match(ov, /role="group" aria-label="Work in"/);
  assert.match(ov, /label="See-through" pressed=\{win\.seeThrough\}/);
  assert.match(ov, /label="Collapse to a pill"/);
  assert.match(ov, /label="Close the overlay and go back to Keplar"/);
  assert.match(ov, /label="Open the overlay"/);
  assert.match(ov, /label="Let Keplar look at Studio again"/);
  const hooks = read(W + "layout/hooks.ts");
  assert.match(hooks, /bridge\.call\("list_roblox_studios", \{\}\)/);
  assert.match(hooks, /setPlace\(blenderPlace\(file\)\)/);
  assert.match(hooks, /fetch\("\/api\/compute"/);
  // Spring drag when the desktop app offers it; app-region drag otherwise (and buttons are never drag regions).
  assert.match(hooks, /supports\?\.springDrag/);
  assert.match(hooks, /dragAvailable\(\)/);
  const css = read(W + "shell.module.css");
  assert.match(css, /\[data-drag="region"\][^{]*\{ -webkit-app-region: drag; \}/);
  assert.match(css, /-webkit-app-region: no-drag/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /backdrop-filter|blur\(|gradient\(|glow/);
});

test("page keeps StudioView / BlenderView's floating overlay and place controls", () => {
  const page = read(W + "Workspace.tsx");
  assert.match(page, /setOverlayTarget\("studio"\); void overlay\.open\(\);/);
  assert.match(page, /setOverlayTarget\("blender"\); void overlay\.open\(\);/);
  assert.match(page, /overlayTarget\(\) === \(isBlender \? "blender" : "studio"\)/);
  assert.match(page, />Float over Studio</);
  assert.match(page, />Bring it back here</);
  assert.match(page, /aria-label="Place to build in" disabled=\{a\.running\}/);
  assert.match(page, /label="Refresh the list of open places"/);
  assert.match(page, /No place is open\. Open a place in Roblox Studio, then refresh\./);
  assert.match(page, /signedIn === true && STUDIO_PLANS\.has\(plan\)/);
});
